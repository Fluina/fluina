export type ArchivedAttachment = {
  id: string;
  name: string;
  type: string;
  size: number;
  blob: Blob;
};

export type ArchivedMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: ArchivedAttachment[];
  timestamp: number;
  duration?: number;
  edited?: boolean;
  notice?: { kind: "cancelled" | "error"; text: string };
};

export type ChatArchiveRecord = ArchivedMessage & {
  sequence: number;
};

export type ChatArchivePage = {
  messages: ChatArchiveRecord[];
  firstSequence: number | null;
  lastSequence: number | null;
  hasOlder: boolean;
  hasNewer: boolean;
};

export type ChatArchiveSummary = {
  content: string;
  throughSequence: number;
};

const DATABASE_NAME = "fluina-chat-archive";
const DATABASE_VERSION = 1;
const MESSAGE_STORE = "messages";
const METADATA_STORE = "metadata";
const SUMMARY_KEY = "summary";

let databasePromise: Promise<IDBDatabase> | null = null;

const openDatabase = () => {
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      const messages = database.createObjectStore(MESSAGE_STORE, {
        keyPath: "sequence",
        autoIncrement: true,
      });
      messages.createIndex("id", "id", { unique: true });
      database.createObjectStore(METADATA_STORE, { keyPath: "key" });
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => {
      databasePromise = null;
      reject(request.error ?? new Error("チャット履歴DBを開けませんでした。"));
    };
    request.onblocked = () => {
      databasePromise = null;
      reject(new Error("チャット履歴DBの更新がブロックされています。"));
    };
  });

  return databasePromise;
};

const readPage = async (
  range: IDBKeyRange | null,
  direction: IDBCursorDirection,
  limit: number,
  hasOppositePage: boolean,
): Promise<ChatArchivePage> => {
  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(MESSAGE_STORE, "readonly");
    const request = transaction
      .objectStore(MESSAGE_STORE)
      .openCursor(range, direction);
    const messages: ChatArchiveRecord[] = [];
    let hasPageBeyond = false;

    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;

      if (messages.length === limit) {
        hasPageBeyond = true;
        return;
      }

      messages.push(cursor.value as ChatArchiveRecord);
      cursor.continue();
    };
    transaction.oncomplete = () => {
      if (direction === "prev") messages.reverse();
      resolve({
        messages,
        firstSequence: messages[0]?.sequence ?? null,
        lastSequence: messages.at(-1)?.sequence ?? null,
        hasOlder: direction === "prev" ? hasPageBeyond : hasOppositePage,
        hasNewer: direction === "next" ? hasPageBeyond : hasOppositePage,
      });
    };
    transaction.onerror = () => {
      reject(
        transaction.error ?? new Error("チャット履歴を読み込めませんでした。"),
      );
    };
  });
};

// 1会話 = ユーザーの送信から始まり、アシスタントの返答までのまとまり。
// 返答前（ユーザーのメッセージのみ）でも1会話として数える。
const readTurnPage = async (
  range: IDBKeyRange | null,
  turnLimit: number,
  hasNewerPage: boolean,
  minimumSequence: number | null,
): Promise<ChatArchivePage> => {
  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(MESSAGE_STORE, "readonly");
    const request = transaction
      .objectStore(MESSAGE_STORE)
      .openCursor(range, "prev");
    const messages: ChatArchiveRecord[] = [];
    let turnCount = 0;
    let hasOlderPage = false;

    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;

      const message = cursor.value as ChatArchiveRecord;
      const oldestLoaded = messages.at(-1);
      const startsOlderTurn =
        !oldestLoaded ||
        (message.role === "assistant" && oldestLoaded.role === "user");

      if (startsOlderTurn) {
        if (
          oldestLoaded &&
          turnCount >= turnLimit &&
          (minimumSequence === null || message.sequence < minimumSequence)
        ) {
          hasOlderPage = true;
          return;
        }
        turnCount += 1;
      }

      messages.push(message);
      cursor.continue();
    };
    transaction.oncomplete = () => {
      messages.reverse();
      resolve({
        messages,
        firstSequence: messages[0]?.sequence ?? null,
        lastSequence: messages.at(-1)?.sequence ?? null,
        hasOlder: hasOlderPage,
        hasNewer: hasNewerPage,
      });
    };
    transaction.onerror = () => {
      reject(
        transaction.error ?? new Error("チャット履歴を読み込めませんでした。"),
      );
    };
  });
};

export const requestPersistentChatStorage = async () => {
  if (!navigator.storage?.persist) return false;
  return navigator.storage.persist();
};

export const appendChatMessage = async (message: ArchivedMessage) => {
  const database = await openDatabase();

  return new Promise<number>((resolve, reject) => {
    const transaction = database.transaction(MESSAGE_STORE, "readwrite");
    const request = transaction.objectStore(MESSAGE_STORE).add(message);
    let sequence = 0;

    request.onsuccess = () => {
      sequence = Number(request.result);
    };
    transaction.oncomplete = () => resolve(sequence);
    transaction.onerror = () => {
      reject(
        transaction.error ?? new Error("チャット履歴を保存できませんでした。"),
      );
    };
  });
};

export const loadLatestChatPage = (limit: number) =>
  readPage(null, "prev", limit, false);

export const loadLatestChatTurns = (
  turnLimit: number,
  minimumSequence: number | null = null,
) => readTurnPage(null, turnLimit, false, minimumSequence);

export const loadOlderChatTurns = (beforeSequence: number, turnLimit: number) =>
  readTurnPage(IDBKeyRange.upperBound(beforeSequence, true), turnLimit, true, null);

export const getChatArchiveSummary = async (): Promise<ChatArchiveSummary> => {
  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(METADATA_STORE, "readonly");
    const request = transaction.objectStore(METADATA_STORE).get(SUMMARY_KEY);

    request.onsuccess = () => {
      const result = request.result as
        | { key: string; content: string; throughSequence: number }
        | undefined;
      resolve({
        content: result?.content ?? "",
        throughSequence: result?.throughSequence ?? 0,
      });
    };
    transaction.onerror = () => {
      reject(
        transaction.error ?? new Error("会話要約を読み込めませんでした。"),
      );
    };
  });
};

export const loadMessagesToSummarize = async (
  afterSequence: number,
  beforeSequence: number,
  limit: number,
) => {
  const database = await openDatabase();

  return new Promise<ChatArchiveRecord[]>((resolve, reject) => {
    const transaction = database.transaction(MESSAGE_STORE, "readonly");
    const range = IDBKeyRange.bound(afterSequence, beforeSequence, true, true);
    const request = transaction
      .objectStore(MESSAGE_STORE)
      .openCursor(range, "next");
    const messages: ChatArchiveRecord[] = [];

    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor || messages.length === limit) return;
      messages.push(cursor.value as ChatArchiveRecord);
      cursor.continue();
    };
    transaction.oncomplete = () => resolve(messages);
    transaction.onerror = () => {
      reject(
        transaction.error ?? new Error("古い会話を読み込めませんでした。"),
      );
    };
  });
};

export const saveChatArchiveSummary = async (summary: ChatArchiveSummary) => {
  const database = await openDatabase();

  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(METADATA_STORE, "readwrite");
    transaction.objectStore(METADATA_STORE).put({
      key: SUMMARY_KEY,
      content: summary.content,
      throughSequence: summary.throughSequence,
    });
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => {
      reject(
        transaction.error ?? new Error("会話要約を保存できませんでした。"),
      );
    };
  });
};

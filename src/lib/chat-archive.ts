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

export const CHAT_RETENTION_MS = 24 * 60 * 60 * 1000;

// 端末の時計が変更されても期限が狂わないよう、サーバー時刻との差を保持する。
// 同期できていない間は、直近の差（未同期なら端末の時計）で代用する。
const CLOCK_OFFSET_KEY = "clockOffset";
let clockOffset = 0;

export const serverNow = () => Date.now() + clockOffset;

export const syncServerClock = async (apiUrl: string) => {
  const requestedAt = Date.now();
  const response = await fetch(`${apiUrl}/api/ask/time`, { cache: "no-store" });
  if (!response.ok) throw new Error("サーバー時刻を取得できませんでした。");

  const payload: unknown = await response.json();
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("now" in payload) ||
    typeof payload.now !== "number"
  ) {
    throw new Error("サーバー時刻の応答が不正です。");
  }

  // 往復時間の半分を通信遅延として補正する
  const receivedAt = Date.now();
  clockOffset = payload.now - (requestedAt + receivedAt) / 2;

  const database = await openDatabase();
  await new Promise<void>((resolve) => {
    const transaction = database.transaction(METADATA_STORE, "readwrite");
    transaction
      .objectStore(METADATA_STORE)
      .put({ key: CLOCK_OFFSET_KEY, value: clockOffset });
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
  });
};

// 直近に同期したオフセットを読み込む。通信できない場合の代用になる。
export const loadStoredClockOffset = async () => {
  const database = await openDatabase();

  return new Promise<void>((resolve) => {
    const transaction = database.transaction(METADATA_STORE, "readonly");
    const request = transaction
      .objectStore(METADATA_STORE)
      .get(CLOCK_OFFSET_KEY);
    request.onsuccess = () => {
      const stored = request.result as { value: number } | undefined;
      if (stored && typeof stored.value === "number")
        clockOffset = stored.value;
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
  });
};

const PURGE_EPOCH_KEY = "purgeEpoch";

// 削除のたびに増える世代番号。要約の作成中に削除が起きたか判定するために使う。
export const getChatPurgeEpoch = async () => {
  const database = await openDatabase();

  return new Promise<number>((resolve, reject) => {
    const transaction = database.transaction(METADATA_STORE, "readonly");
    const request = transaction
      .objectStore(METADATA_STORE)
      .get(PURGE_EPOCH_KEY);

    request.onsuccess = () => {
      resolve((request.result as { value: number } | undefined)?.value ?? 0);
    };
    transaction.onerror = () => {
      reject(
        transaction.error ?? new Error("会話要約を読み込めませんでした。"),
      );
    };
  });
};

// 1ターン（ユーザーの送信とそれに続く返答）を、送信時刻から24時間後にまとめて削除する。
// 削除された会話を含む要約も、内容が残らないよう同じトランザクションで破棄する。
export const purgeExpiredChatTurns = async (now = serverNow()) => {
  const database = await openDatabase();
  const cutoff = now - CHAT_RETENTION_MS;

  return new Promise<number[]>((resolve, reject) => {
    const transaction = database.transaction(
      [MESSAGE_STORE, METADATA_STORE],
      "readwrite",
    );
    const metadata = transaction.objectStore(METADATA_STORE);
    const request = transaction.objectStore(MESSAGE_STORE).openCursor();
    const deleted: number[] = [];
    let turnExpired: boolean | null = null;

    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        if (deleted.length === 0) return;
        metadata.delete(SUMMARY_KEY);
        const epochRequest = metadata.get(PURGE_EPOCH_KEY);
        epochRequest.onsuccess = () => {
          const epoch =
            (epochRequest.result as { value: number } | undefined)?.value ?? 0;
          metadata.put({ key: PURGE_EPOCH_KEY, value: epoch + 1 });
        };
        return;
      }

      const message = cursor.value as ChatArchiveRecord;
      if (message.role === "user" || turnExpired === null) {
        turnExpired = message.timestamp < cutoff;
      }
      if (!turnExpired) return;

      cursor.delete();
      deleted.push(message.sequence);
      cursor.continue();
    };
    transaction.oncomplete = () => resolve(deleted);
    transaction.onerror = () => {
      reject(
        transaction.error ??
          new Error("期限切れの会話を削除できませんでした。"),
      );
    };
  });
};

export const getOldestChatSequence = async () => {
  const database = await openDatabase();

  return new Promise<number | null>((resolve, reject) => {
    const transaction = database.transaction(MESSAGE_STORE, "readonly");
    const request = transaction.objectStore(MESSAGE_STORE).openKeyCursor();

    request.onsuccess = () => {
      resolve(request.result ? Number(request.result.key) : null);
    };
    transaction.onerror = () => {
      reject(
        transaction.error ?? new Error("チャット履歴を読み込めませんでした。"),
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
  readTurnPage(
    IDBKeyRange.upperBound(beforeSequence, true),
    turnLimit,
    true,
    null,
  );

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

// 要約の作成中に削除が起きていた場合（世代番号が違う場合）は、期限切れの内容を
// 含むため保存せず false を返す。
export const saveChatArchiveSummary = async (
  summary: ChatArchiveSummary,
  expectedEpoch: number,
) => {
  const database = await openDatabase();

  return new Promise<boolean>((resolve, reject) => {
    const transaction = database.transaction(METADATA_STORE, "readwrite");
    const store = transaction.objectStore(METADATA_STORE);
    let saved = false;
    const epochRequest = store.get(PURGE_EPOCH_KEY);

    epochRequest.onsuccess = () => {
      const epoch =
        (epochRequest.result as { value: number } | undefined)?.value ?? 0;
      if (epoch !== expectedEpoch) return;
      store.put({
        key: SUMMARY_KEY,
        content: summary.content,
        throughSequence: summary.throughSequence,
      });
      saved = true;
    };
    transaction.oncomplete = () => resolve(saved);
    transaction.onerror = () => {
      reject(
        transaction.error ?? new Error("会話要約を保存できませんでした。"),
      );
    };
  });
};

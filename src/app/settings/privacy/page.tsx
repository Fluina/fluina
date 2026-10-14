import { ShieldLock } from "lucide-react";
import { SettingsSection } from "@/app/settings/_components/settings-section";

export default function PrivacyPage() {
    return (
        <SettingsSection
            icon={ShieldLock}
            title="プライバシー"
            options={[
                {
                    label: "利用状況データ",
                    description: "改善のための利用状況を共有",
                    control: <input type="checkbox" />,
                },
                {
                    label: "検索履歴",
                    description: "検索履歴の保存を管理",
                    control: <span className="text-sm text-fore-9">保存中</span>,
                },
            ]}
        />
    );
}

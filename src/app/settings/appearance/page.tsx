import { SunMoon } from "lucide-react";
import { SettingsSection } from "@/app/settings/_components/settings-section";

export default function AppearancePage() {
    return (
        <SettingsSection
            icon={SunMoon}
            title="反映"
            options={[
                {
                    label: "テーマ",
                    description: "アプリの表示テーマ",
                    control: (
                        <select
                            defaultValue="system"
                            className="rounded-lg border border-back-5 bg-back-1 px-3 py-2"
                        >
                            <option value="system">システム設定</option>
                            <option value="light">ライト</option>
                            <option value="dark">ダーク</option>
                        </select>
                    ),
                },
                {
                    label: "アニメーション",
                    description: "画面のアニメーションを表示",
                    control: <input type="checkbox" defaultChecked />,
                },
            ]}
        />
    );
}

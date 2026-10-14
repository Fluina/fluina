import { Info } from "lucide-react";
import { SettingsSection } from "@/app/settings/_components/settings-section";

export default function AboutPage() {
    return (
        <SettingsSection
            icon={Info}
            title="情報"
            options={[
                {
                    label: "バージョン",
                    description: "現在のアプリケーションバージョン",
                    control: <span className="text-sm text-fore-9">Fluina</span>,
                },
                {
                    label: "ライセンス",
                    description: "ライセンスと利用規約",
                    control: <span className="text-sm text-fore-9">確認する</span>,
                },
            ]}
        />
    );
}

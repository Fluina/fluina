import { ToolCase } from "lucide-react";
import { SettingsSection } from "@/app/settings/_components/settings-section";

export default function FeaturesPage() {
    return (
        <SettingsSection
            icon={ToolCase}
            title="機能"
            options={[
                {
                    label: "自動保存",
                    description: "変更を自動的に保存",
                    control: <input type="checkbox" defaultChecked />,
                },
                {
                    label: "実験的機能",
                    description: "開発中の機能を表示",
                    control: <input type="checkbox" />,
                },
            ]}
        />
    );
}

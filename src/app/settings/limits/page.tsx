import { Hourglass } from "lucide-react";
import { SettingsSection } from "@/app/settings/_components/settings-section";

export default function LimitsPage() {
    return (
        <SettingsSection
            icon={Hourglass}
            title="制限"
            options={[
                {
                    label: "一日の利用時間",
                    description: "一日に利用できる時間",
                    control: (
                        <select
                            defaultValue="unlimited"
                            className="rounded-lg border border-back-5 bg-back-1 px-3 py-2"
                        >
                            <option value="unlimited">無制限</option>
                            <option value="60">60分</option>
                            <option value="120">120分</option>
                        </select>
                    ),
                },
                {
                    label: "休憩通知",
                    description: "休憩のタイミングを知らせる",
                    control: <input type="checkbox" defaultChecked />,
                },
            ]}
        />
    );
}

import { Bell } from "lucide-react";
import { SettingsSection } from "@/app/settings/_components/settings-section";

export default function NotificationsPage() {
    return (
        <SettingsSection
            icon={Bell}
            title="通知"
            options={[
                {
                    label: "デスクトップ通知",
                    description: "新しい通知をデスクトップに表示",
                    control: <input type="checkbox" defaultChecked />,
                },
                {
                    label: "メール通知",
                    description: "重要なお知らせをメールで受け取る",
                    control: <input type="checkbox" />,
                },
            ]}
        />
    );
}

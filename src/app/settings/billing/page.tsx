import { CreditCard } from "lucide-react";
import { SettingsSection } from "@/app/settings/_components/settings-section";

export default function BillingPage() {
    return (
        <SettingsSection
            icon={CreditCard}
            title="請求"
            options={[
                {
                    label: "プラン",
                    description: "現在の契約プラン",
                    control: <span className="text-sm text-fore-9">無料プラン</span>,
                },
                {
                    label: "支払い方法",
                    description: "登録されている支払い方法",
                    control: <span className="text-sm text-fore-9">未登録</span>,
                },
            ]}
        />
    );
}

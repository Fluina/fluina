import type { LucideIcon } from "lucide-react";

interface SettingsOption {
    label: string;
    description: string;
    control: React.ReactNode;
}

interface SettingsSectionProps {
    icon: LucideIcon;
    title: string;
    options: SettingsOption[];
}

export function SettingsSection({
    icon: Icon,
    title,
    options,
}: SettingsSectionProps) {
    return (
        <>
            <header className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-blue">
                    <Icon aria-hidden="true" className="size-5" />
                </div>
                <div>
                    <p className="text-sm text-fore-9">システム</p>
                    <h1 className="text-2xl font-bold">{title}</h1>
                </div>
            </header>

            <section className="max-w-2xl rounded-xl border border-back-5 bg-back-1 p-5">
                <h2 className="text-lg font-semibold">設定</h2>
                <div className="mt-5 flex flex-col divide-y divide-back-5">
                    {options.map(({ label, description, control }) => (
                        <div
                            key={label}
                            className="flex items-center justify-between gap-6 py-4"
                        >
                            <span>
                                <span className="block font-medium">{label}</span>
                                <span className="mt-1 block text-sm text-fore-9">
                                    {description}
                                </span>
                            </span>
                            {control}
                        </div>
                    ))}
                </div>
            </section>
        </>
    );
}

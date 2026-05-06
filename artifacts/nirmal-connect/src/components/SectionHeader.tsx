interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  centered?: boolean;
}

export function SectionHeader({ title, subtitle, centered = true }: SectionHeaderProps) {
  return (
    <div className={`mb-10 ${centered ? "text-center" : ""}`}>
      <div className={`flex items-center gap-3 mb-2 ${centered ? "justify-center" : ""}`}>
        <div className="w-1 h-8 rounded-full bg-primary flex-shrink-0" />
        <h2 className="text-2xl md:text-3xl font-bold text-foreground">{title}</h2>
      </div>
      {subtitle && (
        <p className="text-muted-foreground mt-2 max-w-2xl mx-auto text-sm md:text-base">
          {subtitle}
        </p>
      )}
    </div>
  );
}

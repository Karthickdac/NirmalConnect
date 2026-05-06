import { Skeleton } from "@/components/ui/skeleton";
import { SectionHeader } from "@/components/SectionHeader";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useListFaqs } from "@workspace/api-client-react";
import type { Language } from "@/lib/i18n";
import { t } from "@/lib/i18n";

interface FaqProps { lang: Language; }

export default function Faq({ lang }: FaqProps) {
  const { data, isLoading } = useListFaqs();

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <SectionHeader
        title={lang === "ta" ? "அடிக்கடி கேட்கப்படும் கேள்விகள்" : "Frequently Asked Questions"}
        subtitle={lang === "ta" ? "பொதுமக்கள் அடிக்கடி கேட்கும் கேள்விகளுக்கு விடைகள்" : "Answers to the most common questions from our constituents"}
      />

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14" />)}
        </div>
      ) : !data || data.length === 0 ? (
        <p className="text-center py-8 text-muted-foreground">{t(lang, "noData")}</p>
      ) : (
        <Accordion type="single" collapsible className="space-y-2">
          {[...data].sort((a, b) => a.order - b.order).map((faq) => (
            <AccordionItem key={faq.id} value={String(faq.id)} className="border rounded-lg px-4 data-testid-faq" data-testid={`faq-${faq.id}`}>
              <AccordionTrigger className="text-left font-medium hover:no-underline py-4">
                {lang === "ta" && faq.questionTa ? faq.questionTa : faq.question}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground text-sm pb-4 leading-relaxed">
                {lang === "ta" && faq.answerTa ? faq.answerTa : faq.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </div>
  );
}

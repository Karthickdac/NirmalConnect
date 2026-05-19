import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command, CommandEmpty, CommandGroup,
  CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { TN_CONSTITUENCIES, TN_DISTRICTS } from "@/lib/tnConstituencies";
import type { Language } from "@/lib/i18n";

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  lang?: Language;
  className?: string;
  filterByDistrict?: string;
}

export default function ConstituencyCombobox({
  value, onChange, placeholder, lang, className, filterByDistrict,
}: Props) {
  const [open, setOpen] = useState(false);

  const list = filterByDistrict
    ? TN_CONSTITUENCIES.filter((c) => c.district === filterByDistrict)
    : TN_CONSTITUENCIES;

  const displayLabel = value || (lang === "ta" ? "தொகுதி தேர்வு செய்யவும்" : "Select constituency");
  const placeholderText = placeholder ?? (lang === "ta" ? "தொகுதி தேடவும்..." : "Search constituency...");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between font-normal", !value && "text-muted-foreground", className)}
        >
          <span className="truncate">{value || displayLabel}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <Command>
          <CommandInput placeholder={placeholderText} />
          <CommandEmpty>
            {lang === "ta" ? "தொகுதி கிடைக்கவில்லை" : "No constituency found"}
          </CommandEmpty>
          <CommandList>
            {filterByDistrict ? (
              <CommandGroup heading={filterByDistrict}>
                {list.map((c) => (
                  <CommandItem
                    key={`${c.district}-${c.constituency}`}
                    value={c.constituency}
                    onSelect={(val) => { onChange(val); setOpen(false); }}
                  >
                    <Check className={cn("mr-2 h-4 w-4", value === c.constituency ? "opacity-100" : "opacity-0")} />
                    {c.constituency}
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : (
              TN_DISTRICTS.map((district) => {
                const items = TN_CONSTITUENCIES.filter((c) => c.district === district);
                return (
                  <CommandGroup key={district} heading={district}>
                    {items.map((c) => (
                      <CommandItem
                        key={`${c.district}-${c.constituency}`}
                        value={`${c.constituency} ${district}`}
                        onSelect={() => { onChange(c.constituency); setOpen(false); }}
                      >
                        <Check className={cn("mr-2 h-4 w-4", value === c.constituency ? "opacity-100" : "opacity-0")} />
                        {c.constituency}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                );
              })
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

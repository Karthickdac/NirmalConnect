import { MessageCircle } from "lucide-react";

export function WhatsAppButton() {
  return (
    <a
      href="https://wa.me/919876543210?text=Hello%2C%20I%20need%20assistance%20from%20the%20office%20of%20MLA%20C.T.R.%20Nirmal%20Kumar"
      target="_blank"
      rel="noopener noreferrer"
      data-testid="whatsapp-button"
      className="hidden md:flex fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-xl items-center justify-center transition-transform hover:scale-110 active:scale-95"
      style={{ backgroundColor: "#25D366" }}
      aria-label="Contact via WhatsApp"
    >
      <MessageCircle className="w-7 h-7 text-white" fill="white" />
    </a>
  );
}

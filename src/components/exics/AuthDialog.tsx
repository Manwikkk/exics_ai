import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Logo } from "./Logo";
import { useExics } from "@/lib/exics/store";

export function AuthDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { signInWithGoogle } = useExics();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader className="items-center text-center">
          <div className="mb-3">
            <Logo size={26} />
          </div>
          <DialogTitle className="font-serif text-xl font-medium tracking-tight">
            Welcome to Exics
          </DialogTitle>
          <DialogDescription className="text-xs">
            Sign in to save chats, manage API keys, and use additional providers.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4 space-y-2">
          <Button
            variant="secondary"
            className="w-full h-10"
            onClick={() => {
              signInWithGoogle();
              onOpenChange(false);
            }}
          >
            <GoogleIcon className="mr-2" />
            Continue with Google
          </Button>
          <Button
            variant="ghost"
            className="w-full h-9 text-muted-foreground hover:text-foreground"
            onClick={() => onOpenChange(false)}
          >
            Continue as guest
          </Button>
          <p className="text-[11px] text-muted-foreground text-center pt-2">
            Guest mode uses Groq only. Chats aren't synced.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" className={className} aria-hidden>
      <path fill="#fff" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4c-.2 1.2-.9 2.2-2 2.9v2.4h3.2c1.9-1.7 3-4.3 3-7.1z"/>
      <path fill="#fff" opacity=".7" d="M12 22c2.7 0 5-.9 6.6-2.5l-3.2-2.4c-.9.6-2 .9-3.4.9-2.6 0-4.8-1.7-5.6-4.1H3.1v2.5C4.7 19.6 8.1 22 12 22z"/>
      <path fill="#fff" opacity=".55" d="M6.4 13.9c-.2-.6-.3-1.2-.3-1.9s.1-1.3.3-1.9V7.6H3.1C2.4 9 2 10.5 2 12s.4 3 1.1 4.4l3.3-2.5z"/>
      <path fill="#fff" opacity=".85" d="M12 6.4c1.5 0 2.8.5 3.8 1.5l2.8-2.8C16.9 3.6 14.7 2.7 12 2.7 8.1 2.7 4.7 5.1 3.1 8.6L6.4 11C7.2 8.6 9.4 6.4 12 6.4z"/>
    </svg>
  );
}

import { FilePlus2 } from "lucide-react";

export function DragDropOverlay({ visible }: { visible: boolean }) {
  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm pointer-events-none" aria-hidden>
      <div className="flex flex-col items-center gap-4 text-center px-6">
        <div className="h-20 w-20 rounded-2xl border-2 border-dashed border-foreground/25 flex items-center justify-center">
          <FilePlus2 size={40} strokeWidth={1.25} className="text-foreground/70" />
        </div>
        <p className="text-lg text-foreground/90 font-medium">Drop files here to add to chat</p>
      </div>
    </div>
  );
}

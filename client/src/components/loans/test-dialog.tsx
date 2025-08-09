import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface TestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TestDialog({ open, onOpenChange }: TestDialogProps) {
  console.log("TestDialog rendering, open:", open);
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Test Dialog</DialogTitle>
          <DialogDescription>
            This is a test dialog to verify the dialog component works.
          </DialogDescription>
        </DialogHeader>
        <div className="p-4">
          <p>Dialog is working!</p>
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
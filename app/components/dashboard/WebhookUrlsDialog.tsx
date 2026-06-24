"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface WebhookUrlsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  urls: { telegramWebhook: string; syncWebhook: string; webhookSecret: string } | null;
}

export function WebhookUrlsDialog({
  open,
  onOpenChange,
  urls,
}: WebhookUrlsDialogProps) {
  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Webhook URLs</DialogTitle>
          <DialogDescription>
            Copy these URLs into your GitLab webhook settings
          </DialogDescription>
        </DialogHeader>
        {urls && (
          <div className="space-y-6">
            <div className="space-y-2">
              <Label>Telegram Webhook (Main Board)</Label>
              <div className="flex gap-2">
                <Input
                  value={urls.telegramWebhook}
                  readOnly
                  className="font-mono text-sm"
                />
                <Button
                  variant="outline"
                  onClick={() => copyToClipboard(urls.telegramWebhook)}
                >
                  Copy
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Add this to your Main Board project webhook settings for Issue
                events
              </p>
            </div>
            <div className="space-y-2">
              <Label>Sync Webhook (Child Boards)</Label>
              <div className="flex gap-2">
                <Input
                  value={urls.syncWebhook}
                  readOnly
                  className="font-mono text-sm"
                />
                <Button
                  variant="outline"
                  onClick={() => copyToClipboard(urls.syncWebhook)}
                >
                  Copy
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Add this to each Child Board project webhook settings for Issue
                events
              </p>
            </div>

            <div className="space-y-2">
              <Label>Webhook Secret</Label>
              <div className="flex gap-2">
                <Input
                  value={urls.webhookSecret}
                  readOnly
                  className="font-mono text-sm"
                />
                <Button
                  variant="outline"
                  onClick={() => copyToClipboard(urls.webhookSecret)}
                >
                  Copy
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Paste this into the Secret Token field in your GitLab webhook settings
              </p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

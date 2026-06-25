"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Project, ProjectFormData, defaultFormData } from "@/app/types";
import { useState } from "react";

function generateWebhookSecret(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function getInitialForm(project: Project | null): ProjectFormData {
  if (project) {
    return {
      name: project.name,
      gitlab_api_base: project.gitlab_api_base || "https://gitlab.com/api/v4",
      gitlab_pat: "",
      mgmt_id: project.mgmt_id,
      namespace: project.namespace,
      master_iid: project.master_iid || "",
      telegram_bot_token: "",
      telegram_chat_id: project.telegram_chat_id,
      ignore_users: project.ignore_users || "",
      webhook_secret: project.webhook_secret,
      labels_todo: project.labels_todo,
      labels_in_progress: project.labels_in_progress,
      labels_integrated: project.labels_integrated,
      skip_ignored_users: project.skip_ignored_users ?? false,
      skip_description_only_updates: project.skip_description_only_updates ?? false,
    };
  }
  return {
    ...defaultFormData,
    webhook_secret: generateWebhookSecret(),
  };
}

interface ProjectFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project | null;
  onSubmit: (data: ProjectFormData, projectId?: number) => Promise<void>;
}

export function ProjectFormDialog({
  open,
  onOpenChange,
  project,
  onSubmit,
}: ProjectFormDialogProps) {
  const [form, setForm] = useState<ProjectFormData>(() => getInitialForm(project));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await onSubmit(form, project?.id);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[50vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{project ? "Edit Project" : "Add New Project"}</DialogTitle>
          <DialogDescription>
            Configure GitLab and Telegram settings for this project
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Project Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Project Name *</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g., Mobile App"
              required
            />
          </div>

          {/* GitLab Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              GitLab Configuration
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="gitlab_api_base">GitLab API Base</Label>
                <Input
                  id="gitlab_api_base"
                  value={form.gitlab_api_base}
                  onChange={(e) =>
                    setForm({ ...form, gitlab_api_base: e.target.value })
                  }
                  placeholder="https://gitlab.com/api/v4"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gitlab_pat">GitLab PAT {project ? "" : "*"}</Label>
                <Input
                  id="gitlab_pat"
                  type="password"
                  value={form.gitlab_pat}
                  onChange={(e) => setForm({ ...form, gitlab_pat: e.target.value })}
                  placeholder={project ? "Leave empty to keep existing" : "glpat-xxx"}
                  required={!project}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="mgmt_id">Management Project ID *</Label>
                <Input
                  id="mgmt_id"
                  value={form.mgmt_id}
                  onChange={(e) => setForm({ ...form, mgmt_id: e.target.value })}
                  placeholder="e.g., 456"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="namespace">Namespace *</Label>
                <Input
                  id="namespace"
                  value={form.namespace}
                  onChange={(e) =>
                    setForm({ ...form, namespace: e.target.value })
                  }
                  placeholder="e.g., my-group"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="master_iid">Master Ticket IID</Label>
              <Input
                id="master_iid"
                value={form.master_iid}
                onChange={(e) =>
                  setForm({ ...form, master_iid: e.target.value })
                }
                placeholder="Leave empty for auto-discovery"
              />
            </div>
          </div>

          <Separator />

          {/* Workflow Labels Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Workflow Labels
            </h3>
            <p className="text-xs text-muted-foreground">
              Map your GitLab board labels to sync categories. The sync task uses these to calculate the master ticket status.
            </p>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="labels_todo">To Do Labels</Label>
                <Input
                  id="labels_todo"
                  value={form.labels_todo}
                  onChange={(e) =>
                    setForm({ ...form, labels_todo: e.target.value })
                  }
                  placeholder="Backlog, Refinement, Ready for Dev"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="labels_in_progress">In Progress Labels</Label>
                <Input
                  id="labels_in_progress"
                  value={form.labels_in_progress}
                  onChange={(e) =>
                    setForm({ ...form, labels_in_progress: e.target.value })
                  }
                  placeholder="In Progress, Peer Review, Testing/QA"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="labels_integrated">Integrated Labels</Label>
                <Input
                  id="labels_integrated"
                  value={form.labels_integrated}
                  onChange={(e) =>
                    setForm({ ...form, labels_integrated: e.target.value })
                  }
                  placeholder="Completed, Closed"
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Telegram Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Telegram Configuration
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="telegram_bot_token">Bot Token {project ? "" : "*"}</Label>
                <Input
                  id="telegram_bot_token"
                  type="password"
                  value={form.telegram_bot_token}
                  onChange={(e) =>
                    setForm({ ...form, telegram_bot_token: e.target.value })
                  }
                  placeholder={project ? "Leave empty to keep existing" : "123456:ABC-DEF..."}
                  required={!project}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="telegram_chat_id">Chat ID *</Label>
                <Input
                  id="telegram_chat_id"
                  value={form.telegram_chat_id}
                  onChange={(e) =>
                    setForm({ ...form, telegram_chat_id: e.target.value })
                  }
                  placeholder="e.g., -1001234567890"
                  required
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Advanced Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Advanced
            </h3>
            <div className="grid grid-cols-2 gap-4 items-start">
              <div className="space-y-2">
                <div className="h-8 flex items-center">
                  <Label htmlFor="ignore_users">Ignore Users</Label>
                </div>
                <Input
                  id="ignore_users"
                  value={form.ignore_users}
                  onChange={(e) =>
                    setForm({ ...form, ignore_users: e.target.value })
                  }
                  placeholder="user1, user2"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between h-8">
                  <Label htmlFor="webhook_secret">Webhook Secret</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() =>
                      setForm({ ...form, webhook_secret: generateWebhookSecret() })
                    }
                  >
                    Regenerate
                  </Button>
                </div>
                <Input
                  id="webhook_secret"
                  value={form.webhook_secret}
                  onChange={(e) =>
                    setForm({ ...form, webhook_secret: e.target.value })
                  }
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground leading-tight">
                  Auto-generated. Copy into your GitLab webhook Secret Token field.
                </p>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="skip_ignored_users"
                  checked={form.skip_ignored_users}
                  onChange={(e) =>
                    setForm({ ...form, skip_ignored_users: e.target.checked })
                  }
                  className="h-4 w-4"
                />
                <Label htmlFor="skip_ignored_users" className="cursor-pointer text-sm">
                  Skip ignored users entirely
                </Label>
              </div>
              <p className="text-xs text-muted-foreground ml-6">
                When enabled, events from users listed in &quot;Ignore Users&quot; will not send any Telegram notification. When disabled, they will still be sent with a robot marker.
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="skip_description_only_updates"
                  checked={form.skip_description_only_updates}
                  onChange={(e) =>
                    setForm({ ...form, skip_description_only_updates: e.target.checked })
                  }
                  className="h-4 w-4"
                />
                <Label htmlFor="skip_description_only_updates" className="cursor-pointer text-sm">
                  Skip description-only issue updates
                </Label>
              </div>
              <p className="text-xs text-muted-foreground ml-6">
                When enabled, issue update notifications will be skipped if the only change is to the description field.
              </p>
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit">{project ? "Update" : "Create"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

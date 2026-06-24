export interface Project {
  id: number;
  name: string;
  gitlab_api_base: string;
  mgmt_id: string;
  namespace: string;
  master_iid: string | null;
  telegram_chat_id: string;
  ignore_users: string;
  webhook_secret: string;
  labels_todo: string;
  labels_in_progress: string;
  labels_integrated: string;
  created_at: string;
  updated_at: string;
}

export interface SyncLog {
  id: number;
  project_id: number | null;
  event_type: string | null;
  master_iid: string | null;
  status: string;
  message: string | null;
  created_at: string;
}

export interface ProjectFormData {
  name: string;
  gitlab_api_base: string;
  gitlab_pat: string;
  mgmt_id: string;
  namespace: string;
  master_iid: string;
  telegram_bot_token: string;
  telegram_chat_id: string;
  ignore_users: string;
  webhook_secret: string;
  labels_todo: string;
  labels_in_progress: string;
  labels_integrated: string;
}

export const defaultFormData: ProjectFormData = {
  name: "",
  gitlab_api_base: "https://gitlab.com/api/v4",
  gitlab_pat: "",
  mgmt_id: "",
  namespace: "",
  master_iid: "",
  telegram_bot_token: "",
  telegram_chat_id: "",
  ignore_users: "",
  webhook_secret: "",
  labels_todo: "Backlog, Refinement, Ready for Dev",
  labels_in_progress: "In Progress, Peer Review, Testing/QA",
  labels_integrated: "Completed, Closed",
};

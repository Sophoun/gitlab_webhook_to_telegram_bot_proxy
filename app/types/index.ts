export interface Project {
  id: number;
  name: string;
  gitlabApiBase: string;
  gitlabPat: string;
  mgmtId: string;
  namespace: string;
  masterIid: string | null;
  telegramBotToken: string;
  telegramChatId: string;
  ignoreUsers: string;
  webhookSecret: string;
  labelsTodo: string;
  labelsInProgress: string;
  labelsIntegrated: string;
  skipIgnoredUsers: boolean;
  skipDescriptionOnlyUpdates: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SyncLog {
  id: number;
  projectId: number | null;
  eventType: string | null;
  masterIid: string | null;
  status: string;
  message: string | null;
  createdAt: string;
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
  skip_ignored_users: boolean;
  skip_description_only_updates: boolean;
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
  skip_ignored_users: false,
  skip_description_only_updates: false,
};

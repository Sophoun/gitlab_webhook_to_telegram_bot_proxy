export interface Project {
  id: number;
  name: string;
  gitlabApiBase: string | null;
  gitlabPat: string;
  mgmtId: string;
  namespace: string;
  masterIid: string | null;
  telegramBotToken: string;
  telegramChatId: string;
  ignoreUsers: string | null;
  webhookSecret: string;
  labelsTodo: string | null;
  labelsInProgress: string | null;
  labelsIntegrated: string | null;
  skipIgnoredUsers: boolean | null;
  skipDescriptionOnlyUpdates: boolean | null;
  createdAt: Date | null;
  updatedAt: Date | null;
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

export interface UserActivity {
  id: number;
  projectId: number;
  projectName: string;
  gitlabProjectId: number;
  userName: string;
  userUsername: string;
  activityType: string;
  itemIid: number;
  itemTitle: string | null;
  itemUrl: string | null;
  occurredAt: string | Date;
  syncedAt: string | Date | null;
  labels: string | null;
  state: string | null;
}

export interface UserStats {
  username: string;
  name: string;
  issuesCreated: number;
  issuesClosed: number;
  issuesReopened: number;
  issueComments: number;
  mrsCreated: number;
  mrsMerged: number;
  mrsClosed: number;
  mrComments: number;
  commits: number;
  score: number;
}

export interface TrackerStats {
  summary: {
    totalIssuesCreated: number;
    totalIssuesClosed: number;
    totalMrsCreated: number;
    totalMrsMerged: number;
    totalCommits: number;
    totalComments: number;
  };
  users: UserStats[];
  weeklyActivity: WeeklyActivity[];
  userInsights?: UserInsight[];
}

export interface UserInsight {
  username: string;
  name: string;
  issuesCreated: number;
  issuesClosed: number;
  issuesOpen: number;
  avgTimeToClose: number | null;
  avgTimeToFirstResponse: number | null;
  labelBreakdown: Record<string, number>;
  issuesCommentedOn: number;
  uniqueCollaborators: number;
  respondedToOthers: number;
  receivedResponses: number;
}

export interface WeeklyActivity {
  week: string;
  issuesCreated: number;
  issuesClosed: number;
  mrsCreated: number;
  mrsMerged: number;
  commits: number;
  comments: number;
}

export interface SyncResponse {
  status: string;
  message: string;
  stats: {
    projectsSynced: number;
    issuesFetched: number;
    mrsFetched: number;
    commitsFetched: number;
    activitiesRecorded: number;
  };
}

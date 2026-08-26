import { Project } from "../app/types";

export interface GitLabProject {
  id: number;
  name: string;
  path_with_namespace: string;
  web_url: string;
  default_branch: string;
}

export interface GitLabIssue {
  id: number;
  iid: number;
  title: string;
  state: string;
  created_at: string;
  closed_at: string | null;
  updated_at: string;
  author: {
    name: string;
    username: string;
  };
  // Present on modern GitLab when the issue is closed
  closed_by?: Array<{
    name: string;
    username: string;
  }> | null;
  labels: string[];
  assignees?: Array<{
    username: string;
    name: string;
  }>;
  web_url: string;
  description?: string;
}

export interface GitLabMergeRequest {
  id: number;
  iid: number;
  title: string;
  state: string;
  created_at: string;
  merged_at: string | null;
  closed_at: string | null;
  updated_at: string;
  author: {
    name: string;
    username: string;
  };
  merged_by?: {
    name: string;
    username: string;
  } | null;
  labels: string[];
  web_url: string;
}

export interface GitLabMember {
  id: number;
  username: string;
  name: string;
  email?: string | null;
  public_email?: string | null;
}

export interface GitLabIssueLink {
  id: number;
  iid: number;
  project_id: number;
  title: string;
  state: string;
  link_type: string;
  web_url?: string;
}

export interface GitLabNote {
  id: number;
  body: string;
  author: {
    name: string;
    username: string;
  };
  created_at: string;
  system: boolean;
  noteable_type: string;
}

export interface GitLabCommit {
  id: string;
  short_id: string;
  title: string;
  message: string;
  author_name: string;
  author_email: string;
  authored_date: string;
  committer_name: string;
  committer_email: string;
  committed_date: string;
  web_url: string;
}

export interface GitLabBranch {
  name: string;
  default: boolean;
  merged: boolean;
}

const RATE_LIMIT_DELAY = 200; // 200ms between requests (GitLab allows ~60 req/min)
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = MAX_RETRIES
): Promise<Response> {
  try {
    const response = await fetch(url, options);

    if (response.status === 429) {
      // Rate limited - wait and retry
      const retryAfter = response.headers.get("Retry-After");
      const delay = retryAfter ? parseInt(retryAfter, 10) * 1000 : RETRY_DELAY;
      console.log(`Rate limited. Waiting ${delay}ms before retry...`);
      await sleep(delay);
      return fetchWithRetry(url, options, retries - 1);
    }

    if (!response.ok) {
      throw new Error(`GitLab API error: ${response.status} ${response.statusText}`);
    }

    return response;
  } catch (error) {
    if (retries > 0) {
      console.log(`Request failed. Retrying in ${RETRY_DELAY}ms... (${retries} retries left)`);
      await sleep(RETRY_DELAY);
      return fetchWithRetry(url, options, retries - 1);
    }
    throw error;
  }
}

export class GitLabClient {
  private apiBase: string;
  private pat: string;

  constructor(apiBase: string, pat: string) {
    this.apiBase = apiBase.replace(/\/$/, "");
    this.pat = pat;
  }

  private getHeaders(): HeadersInit {
    return {
      "PRIVATE-TOKEN": this.pat,
      "Content-Type": "application/json",
    };
  }

  async getProjects(): Promise<GitLabProject[]> {
    const projects: GitLabProject[] = [];
    let page = 1;
    const perPage = 100;

    while (true) {
      const url = `${this.apiBase}/projects?page=${page}&per_page=${perPage}&membership=true&order_by=last_activity_at`;
      const response = await fetchWithRetry(url, { headers: this.getHeaders() });
      const data = await response.json();

      if (!Array.isArray(data) || data.length === 0) {
        break;
      }

      projects.push(...data);
      await sleep(RATE_LIMIT_DELAY);

      if (data.length < perPage) {
        break;
      }
      page++;
    }

    return projects;
  }

  /**
   * Fetch all members (direct + inherited) of a project.
   * Used to map commit author emails/names to real GitLab usernames.
   */
  async getProjectMembers(projectId: number): Promise<GitLabMember[]> {
    const members: GitLabMember[] = [];
    let page = 1;
    const perPage = 100;

    while (true) {
      const url = `${this.apiBase}/projects/${projectId}/members/all?page=${page}&per_page=${perPage}`;
      const response = await fetchWithRetry(url, { headers: this.getHeaders() });
      const data = await response.json();

      if (!Array.isArray(data) || data.length === 0) {
        break;
      }

      members.push(...data);
      await sleep(RATE_LIMIT_DELAY);

      if (data.length < perPage) {
        break;
      }
      page++;
    }

    return members;
  }

  async getIssues(
    projectId: number,
    since?: string
  ): Promise<GitLabIssue[]> {    const issues: GitLabIssue[] = [];
    let page = 1;
    const perPage = 100;

    while (true) {
      let url = `${this.apiBase}/projects/${projectId}/issues?page=${page}&per_page=${perPage}&scope=all`;
      if (since) {
        url += `&updated_after=${since}`;
      }

      const response = await fetchWithRetry(url, { headers: this.getHeaders() });
      const data = await response.json();

      if (!Array.isArray(data) || data.length === 0) {
        break;
      }

      issues.push(...data);
      await sleep(RATE_LIMIT_DELAY);

      if (data.length < perPage) {
        break;
      }
      page++;
    }

    return issues;
  }

  async getMergeRequests(
    projectId: number,
    since?: string
  ): Promise<GitLabMergeRequest[]> {
    const mrs: GitLabMergeRequest[] = [];
    let page = 1;
    const perPage = 100;

    while (true) {
      let url = `${this.apiBase}/projects/${projectId}/merge_requests?page=${page}&per_page=${perPage}&scope=all`;
      if (since) {
        url += `&updated_after=${since}`;
      }

      const response = await fetchWithRetry(url, { headers: this.getHeaders() });
      const data = await response.json();

      if (!Array.isArray(data) || data.length === 0) {
        break;
      }

      mrs.push(...data);
      await sleep(RATE_LIMIT_DELAY);

      if (data.length < perPage) {
        break;
      }
      page++;
    }

    return mrs;
  }

  async getIssueNotes(
    projectId: number,
    issueIid: number
  ): Promise<GitLabNote[]> {
    const notes: GitLabNote[] = [];
    let page = 1;
    const perPage = 100;

    while (true) {
      const url = `${this.apiBase}/projects/${projectId}/issues/${issueIid}/notes?page=${page}&per_page=${perPage}`;
      const response = await fetchWithRetry(url, { headers: this.getHeaders() });
      const data = await response.json();

      if (!Array.isArray(data) || data.length === 0) {
        break;
      }

      notes.push(...data);
      await sleep(RATE_LIMIT_DELAY);

      if (data.length < perPage) {
        break;
      }
      page++;
    }

    return notes;
  }

  /**
   * Fetch issues formally linked to this issue via GitLab's "Linked issues"
   * feature (relates_to / blocks / is_blocked_by). May include issues from
   * other projects.
   */
  async getIssueLinks(
    projectId: number,
    issueIid: number
  ): Promise<GitLabIssueLink[]> {
    const links: GitLabIssueLink[] = [];
    let page = 1;
    const perPage = 100;

    while (true) {
      const url = `${this.apiBase}/projects/${projectId}/issues/${issueIid}/links?page=${page}&per_page=${perPage}`;
      const response = await fetchWithRetry(url, { headers: this.getHeaders() });
      const data = await response.json();

      if (!Array.isArray(data) || data.length === 0) {
        break;
      }

      links.push(...data);
      await sleep(RATE_LIMIT_DELAY);

      if (data.length < perPage) {
        break;
      }
      page++;
    }

    return links;
  }

  async getMergeRequestNotes(
    projectId: number,
    mrIid: number
  ): Promise<GitLabNote[]> {
    const notes: GitLabNote[] = [];
    let page = 1;
    const perPage = 100;

    while (true) {
      const url = `${this.apiBase}/projects/${projectId}/merge_requests/${mrIid}/notes?page=${page}&per_page=${perPage}`;
      const response = await fetchWithRetry(url, { headers: this.getHeaders() });
      const data = await response.json();

      if (!Array.isArray(data) || data.length === 0) {
        break;
      }

      notes.push(...data);
      await sleep(RATE_LIMIT_DELAY);

      if (data.length < perPage) {
        break;
      }
      page++;
    }

    return notes;
  }

  /**
   * Fetch the most recently active branches of a project. Bounded by
   * maxBranches so huge repos with hundreds of stale branches don't explode
   * sync time.
   *
   * Sorting is done CLIENT-SIDE by each branch's last commit date — older
   * self-hosted GitLab versions reject `order_by=updated&sort=desc`
   * ("sort does not have a valid value"), so no ordering params are sent.
   */
  async getBranches(projectId: number, maxBranches = 10): Promise<string[]> {
    const url = `${this.apiBase}/projects/${projectId}/repository/branches?per_page=100`;
    const response = await fetchWithRetry(url, { headers: this.getHeaders() });
    const data = await response.json();
    if (!Array.isArray(data)) return [];
    const sorted = [...data]
      .sort(
        (a: GitLabBranch, b: GitLabBranch) =>
          new Date(b.commit?.committed_date ?? 0).getTime() -
          new Date(a.commit?.committed_date ?? 0).getTime()
      )
      .slice(0, maxBranches);
    return sorted.map((b: GitLabBranch) => b.name).filter(Boolean);
  }

  async getCommits(
    projectId: number,
    since?: string,
    until?: string,
    ref?: string
  ): Promise<GitLabCommit[]> {
    const commits: GitLabCommit[] = [];
    let page = 1;
    const perPage = 100;

    while (true) {
      let url = `${this.apiBase}/projects/${projectId}/repository/commits?page=${page}&per_page=${perPage}`;
      if (since) {
        url += `&since=${since}`;
      }
      if (until) {
        url += `&until=${until}`;
      }
      if (ref) {
        url += `&ref_name=${encodeURIComponent(ref)}`;
      }

      const response = await fetchWithRetry(url, { headers: this.getHeaders() });
      const data = await response.json();

      if (!Array.isArray(data) || data.length === 0) {
        break;
      }

      commits.push(...data);
      await sleep(RATE_LIMIT_DELAY);

      if (data.length < perPage) {
        break;
      }
      page++;
    }

    return commits;
  }

  /**
   * Fetch commits across ALL recently-active branches, deduplicated by SHA.
   *
   * The plain getCommits() only walks the DEFAULT branch, so feature-branch
   * work is invisible until merged (and squash merges collapse it to a single
   * commit) — which massively undercounts real coding activity. Iterating
   * branches fixes that; the branch cap keeps API cost bounded.
   */
  async getAllBranchCommits(
    projectId: number,
    since?: string,
    defaultBranch?: string,
    maxBranches = 10
  ): Promise<GitLabCommit[]> {
    // Branch listing can fail (empty/archived projects return 404) — that
    // must never abort the whole sync, so fall back to the default branch.
    let branches: string[];
    try {
      branches = await this.getBranches(projectId, maxBranches);
    } catch {
      branches = [];
    }
    if (branches.length === 0 && defaultBranch) {
      branches = [defaultBranch];
    } else if (defaultBranch && !branches.includes(defaultBranch)) {
      branches.unshift(defaultBranch);
    }

    const seen = new Set<string>();
    const all: GitLabCommit[] = [];
    for (const ref of branches) {
      try {
        const branchCommits = await this.getCommits(projectId, since, undefined, ref);
        for (const c of branchCommits) {
          if (!seen.has(c.id)) {
            seen.add(c.id);
            all.push(c);
          }
        }
      } catch (error) {
        console.warn(
          `    Could not fetch commits for branch ${ref}: ${error instanceof Error ? error.message : error}`
        );
      }
    }
    return all;
  }
}

export function createGitLabClient(project: Project): GitLabClient {
  const apiBase = project.gitlabApiBase || "https://gitlab.com/api/v4";
  return new GitLabClient(apiBase, project.gitlabPat);
}

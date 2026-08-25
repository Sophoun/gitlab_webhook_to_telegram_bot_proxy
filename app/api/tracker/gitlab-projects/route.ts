import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { projects } from "@/db/schema";
import { createGitLabClient, GitLabProject } from "@/lib/gitlab-api";

interface GitLabProjectWithConfig extends GitLabProject {
  configId: number;
  configName: string;
}

export async function GET() {
  try {
    const db = getDb();
    const allProjects = await db.select().from(projects);

    const allGitLabProjects: GitLabProjectWithConfig[] = [];
    const seen = new Set<number>(); // Dedupe by GitLab project ID

    for (const project of allProjects) {
      try {
        const client = createGitLabClient({
          ...project,
          gitlabApiBase: project.gitlabApiBase || "https://gitlab.com/api/v4",
        });

        const gitlabProjects = await client.getProjects();

        for (const gp of gitlabProjects) {
          if (!seen.has(gp.id)) {
            seen.add(gp.id);
            allGitLabProjects.push({
              ...gp,
              configId: project.id,
              configName: project.name,
            });
          }
        }
      } catch (error) {
        console.error(`Error fetching GitLab projects for config ${project.id}:`, error);
      }
    }

    return NextResponse.json({ projects: allGitLabProjects });
  } catch (error) {
    console.error("Failed to fetch GitLab projects:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

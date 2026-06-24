"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatsCards } from "./components/dashboard/StatsCards";
import { ProjectsTable } from "./components/dashboard/ProjectsTable";
import { ActivityLog } from "./components/dashboard/ActivityLog";
import { ProjectFormDialog } from "./components/dashboard/ProjectFormDialog";
import { WebhookUrlsDialog } from "./components/dashboard/WebhookUrlsDialog";
import { Project, SyncLog, ProjectFormData } from "./types";

export default function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [webhookDialogOpen, setWebhookDialogOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [webhookUrls, setWebhookUrls] = useState<{
    telegramWebhook: string;
    syncWebhook: string;
    webhookSecret: string;
  } | null>(null);

  const [refreshKey, setRefreshKey] = useState(0);
  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    let mounted = true;

    async function loadData() {
      try {
        const [projectsRes, logsRes] = await Promise.all([
          fetch("/api/projects"),
          fetch("/api/sync-logs?limit=50"),
        ]);

        const projectsData = await projectsRes.json();
        const logsData = await logsRes.json();

        if (mounted) {
          setProjects(projectsData.projects || []);
          setLogs(logsData.logs || []);
        }
      } catch (error) {
        console.error("Failed to fetch data:", error);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    loadData();

    return () => {
      mounted = false;
    };
  }, [refreshKey]);

  async function handleSubmit(formData: ProjectFormData, projectId?: number) {
    const url = projectId ? `/api/projects/${projectId}` : "/api/projects";
    const method = projectId ? "PUT" : "POST";

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        setDialogOpen(false);
        setSelectedProject(null);
        setRefreshKey((k) => k + 1);
      } else {
        const error = await res.json();
        alert(`Error: ${error.error}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      alert(`Error: ${message}`);
    }
  }

  async function handleDelete(id: number) {
    try {
      const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
      if (res.ok) {
        setRefreshKey((k) => k + 1);
      }
    } catch (error) {
      console.error("Failed to delete project:", error);
    }
  }

  async function fetchWebhookUrls(projectId: number) {
    try {
      const res = await fetch(`/api/webhook-urls?projectId=${projectId}`);
      const data = await res.json();
      setWebhookUrls(data);
      setWebhookDialogOpen(true);
    } catch (error) {
      console.error("Failed to fetch webhook URLs:", error);
    }
  }

  function handleEdit(project: Project) {
    setSelectedProject(project);
    setDialogOpen(true);
  }

  function handleAdd() {
    setSelectedProject(null);
    setFormKey((k) => k + 1);
    setDialogOpen(true);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              GitLab-Telegram Proxy
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage project mappings and webhook configurations
            </p>
          </div>
          <Button onClick={handleAdd}>
            <span className="mr-2">+</span> Add Project
          </Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Stats Cards */}
        <StatsCards projects={projects} logs={logs} />

        {/* Projects Table */}
        <Card>
          <CardHeader>
            <CardTitle>Projects</CardTitle>
            <CardDescription>
              Configure your GitLab projects and Telegram settings
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ProjectsTable
              projects={projects}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onShowUrls={fetchWebhookUrls}
              onAdd={handleAdd}
            />
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>
              Latest sync events and status updates
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ActivityLog logs={logs} />
          </CardContent>
        </Card>
      </main>

      {/* Dialogs */}
      <ProjectFormDialog
        key={selectedProject?.id ?? `new-${formKey}`}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        project={selectedProject}
        onSubmit={handleSubmit}
      />

      <WebhookUrlsDialog
        open={webhookDialogOpen}
        onOpenChange={setWebhookDialogOpen}
        urls={webhookUrls}
      />
    </div>
  );
}

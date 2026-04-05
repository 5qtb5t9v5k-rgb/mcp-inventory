import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { TodoistClient } from "../sources/todoist/client.js";
import type { Task, Project, Section, Label, Comment } from "../sources/todoist/types.js";

function text(data: unknown, isError = false) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    isError,
  };
}

export function registerTodoistTools(server: McpServer, token: string): void {
  const client = new TodoistClient(token);

  // --- Tasks ---

  server.tool(
    "todoist_get_tasks",
    "Get tasks from Todoist. Filter by project, label, or use Todoist filter syntax (e.g. 'today', 'overdue', 'p1')",
    {
      project_id: z.string().optional().describe("Filter by project ID"),
      label: z.string().optional().describe("Filter by label name"),
      filter: z.string().optional().describe("Todoist filter query (e.g. 'today', 'overdue', 'p1 & #Work')"),
    },
    async ({ project_id, label, filter }) => {
      try {
        const params: Record<string, string> = {};
        if (project_id) params.project_id = project_id;
        if (label) params.label = label;
        if (filter) params.filter = filter;
        const tasks = await client.get<Task[]>("/tasks", params);
        return text(tasks);
      } catch (err) {
        return text({ error: String(err) }, true);
      }
    }
  );

  server.tool(
    "todoist_create_task",
    "Create a new task in Todoist",
    {
      content: z.string().describe("Task title/content"),
      description: z.string().optional().describe("Task description (markdown)"),
      project_id: z.string().optional().describe("Project ID to add task to"),
      section_id: z.string().optional().describe("Section ID"),
      parent_id: z.string().optional().describe("Parent task ID for subtasks"),
      due_string: z.string().optional().describe("Due date in natural language (e.g. 'tomorrow', 'every monday', 'Jan 5')"),
      due_date: z.string().optional().describe("Due date (YYYY-MM-DD)"),
      priority: z.number().min(1).max(4).optional().describe("Priority 1-4 (4 = urgent)"),
      labels: z.array(z.string()).optional().describe("Label names to assign"),
    },
    async (params) => {
      try {
        const body: Record<string, unknown> = { content: params.content };
        if (params.description) body.description = params.description;
        if (params.project_id) body.project_id = params.project_id;
        if (params.section_id) body.section_id = params.section_id;
        if (params.parent_id) body.parent_id = params.parent_id;
        if (params.due_string) body.due_string = params.due_string;
        if (params.due_date) body.due_date = params.due_date;
        if (params.priority) body.priority = params.priority;
        if (params.labels) body.labels = params.labels;
        const task = await client.post<Task>("/tasks", body);
        return text(task);
      } catch (err) {
        return text({ error: String(err) }, true);
      }
    }
  );

  server.tool(
    "todoist_update_task",
    "Update an existing task in Todoist",
    {
      task_id: z.string().describe("Task ID to update"),
      content: z.string().optional().describe("New task title"),
      description: z.string().optional().describe("New description"),
      due_string: z.string().optional().describe("New due date in natural language"),
      due_date: z.string().optional().describe("New due date (YYYY-MM-DD)"),
      priority: z.number().min(1).max(4).optional().describe("New priority 1-4"),
      labels: z.array(z.string()).optional().describe("New labels"),
    },
    async ({ task_id, ...updates }) => {
      try {
        const body: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(updates)) {
          if (v !== undefined) body[k] = v;
        }
        const task = await client.post<Task>(`/tasks/${task_id}`, body);
        return text(task);
      } catch (err) {
        return text({ error: String(err) }, true);
      }
    }
  );

  server.tool(
    "todoist_complete_task",
    "Mark a task as completed",
    {
      task_id: z.string().describe("Task ID to complete"),
    },
    async ({ task_id }) => {
      try {
        await client.post(`/tasks/${task_id}/close`);
        return text({ message: "Task completed", task_id });
      } catch (err) {
        return text({ error: String(err) }, true);
      }
    }
  );

  server.tool(
    "todoist_delete_task",
    "Delete a task permanently",
    {
      task_id: z.string().describe("Task ID to delete"),
    },
    async ({ task_id }) => {
      try {
        await client.delete(`/tasks/${task_id}`);
        return text({ message: "Task deleted", task_id });
      } catch (err) {
        return text({ error: String(err) }, true);
      }
    }
  );

  // --- Projects ---

  server.tool(
    "todoist_get_projects",
    "Get all projects from Todoist",
    {},
    async () => {
      try {
        const projects = await client.get<Project[]>("/projects");
        return text(projects);
      } catch (err) {
        return text({ error: String(err) }, true);
      }
    }
  );

  server.tool(
    "todoist_create_project",
    "Create a new project in Todoist",
    {
      name: z.string().describe("Project name"),
      color: z.string().optional().describe("Color name (e.g. 'berry_red', 'blue')"),
      is_favorite: z.boolean().optional().describe("Add to favorites"),
    },
    async (params) => {
      try {
        const project = await client.post<Project>("/projects", params as Record<string, unknown>);
        return text(project);
      } catch (err) {
        return text({ error: String(err) }, true);
      }
    }
  );

  // --- Sections ---

  server.tool(
    "todoist_get_sections",
    "Get sections, optionally filtered by project",
    {
      project_id: z.string().optional().describe("Filter by project ID"),
    },
    async ({ project_id }) => {
      try {
        const params: Record<string, string> = {};
        if (project_id) params.project_id = project_id;
        const sections = await client.get<Section[]>("/sections", params);
        return text(sections);
      } catch (err) {
        return text({ error: String(err) }, true);
      }
    }
  );

  // --- Labels ---

  server.tool(
    "todoist_get_labels",
    "Get all personal labels",
    {},
    async () => {
      try {
        const labels = await client.get<Label[]>("/labels");
        return text(labels);
      } catch (err) {
        return text({ error: String(err) }, true);
      }
    }
  );

  // --- Comments ---

  server.tool(
    "todoist_get_comments",
    "Get comments for a task or project",
    {
      task_id: z.string().optional().describe("Task ID to get comments for"),
      project_id: z.string().optional().describe("Project ID to get comments for"),
    },
    async ({ task_id, project_id }) => {
      try {
        const params: Record<string, string> = {};
        if (task_id) params.task_id = task_id;
        if (project_id) params.project_id = project_id;
        const comments = await client.get<Comment[]>("/comments", params);
        return text(comments);
      } catch (err) {
        return text({ error: String(err) }, true);
      }
    }
  );

  server.tool(
    "todoist_add_comment",
    "Add a comment to a task or project",
    {
      content: z.string().describe("Comment text (markdown)"),
      task_id: z.string().optional().describe("Task ID"),
      project_id: z.string().optional().describe("Project ID"),
    },
    async (params) => {
      try {
        const comment = await client.post<Comment>("/comments", params as Record<string, unknown>);
        return text(comment);
      } catch (err) {
        return text({ error: String(err) }, true);
      }
    }
  );
}

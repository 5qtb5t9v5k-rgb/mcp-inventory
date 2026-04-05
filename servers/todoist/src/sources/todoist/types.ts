export interface Task {
  id: string;
  content: string;
  description: string;
  project_id: string;
  section_id: string | null;
  parent_id: string | null;
  order: number;
  priority: number;
  labels: string[];
  due: {
    date: string;
    string: string;
    datetime: string | null;
    timezone: string | null;
    is_recurring: boolean;
  } | null;
  is_completed: boolean;
  created_at: string;
  url: string;
}

export interface Project {
  id: string;
  name: string;
  color: string;
  order: number;
  is_favorite: boolean;
  is_inbox_project: boolean;
  view_style: string;
  url: string;
}

export interface Section {
  id: string;
  project_id: string;
  name: string;
  order: number;
}

export interface Label {
  id: string;
  name: string;
  color: string;
  order: number;
  is_favorite: boolean;
}

export interface Comment {
  id: string;
  task_id?: string;
  project_id?: string;
  content: string;
  posted_at: string;
}

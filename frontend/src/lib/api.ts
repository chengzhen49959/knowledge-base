import { createClient } from '@/lib/supabase/client'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:8000'

/** Shared fetch wrapper. Attaches the bearer token and parses JSON. */
export async function request<T>(
  path: string,
  accessToken: string | undefined,
  init?: RequestInit,
): Promise<T> {
  const headers: Record<string, string> = {}
  // FormData bodies must set their own multipart boundary — don't override.
  if (!(init?.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`
  }
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) },
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${await res.text()}`)
  }
  return res.json() as Promise<T>
}

/** Call FastAPI from a Client Component (token from the browser session). */
export async function apiClient<T>(path: string, init?: RequestInit): Promise<T> {
  const supabase = createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  return request<T>(path, session?.access_token, init)
}

export type Me = { id: string; email: string | null }
export type Health = { status: string }

export type IngestResult = {
  source_id: string
  summary: string
  parts: number
  input_bytes: number
  timings: Record<string, number>
  created: string[]
  merged: { new: string; existing: string; similarity: number }[]
}

export type ConceptSummary = {
  id: string
  name: string
  description: string
  created_at: string
  updated_at: string
  source_count: number
}

export type ConceptSource = {
  id: string
  title: string
  source_type: string
  origin: string | null
  summary: string
  created_at: string
  /** How this concept was described by this particular source. */
  concept_description: string
}

export type ConceptDetail = Omit<ConceptSummary, 'source_count'> & {
  sources: ConceptSource[]
}

export type SourceSummary = {
  id: string
  title: string
  source_type: string
  origin: string | null
  summary: string
  created_at: string
  concept_count: number
}

export type SourceDetail = Omit<SourceSummary, 'concept_count'> & {
  concepts: { id: string; name: string; description: string }[]
}

export const knowledgeApi = {
  concepts: () => apiClient<ConceptSummary[]>('/api/concepts'),
  concept: (id: string) => apiClient<ConceptDetail>(`/api/concepts/${id}`),
  sources: () => apiClient<SourceSummary[]>('/api/sources'),
  source: (id: string) => apiClient<SourceDetail>(`/api/sources/${id}`),
  ingestFile: (file: File) => {
    const body = new FormData()
    body.append('file', file)
    return apiClient<IngestResult>('/api/ingest', { method: 'POST', body })
  },
  ingestUrl: (url: string) => {
    const body = new FormData()
    body.append('url', url)
    return apiClient<IngestResult>('/api/ingest', { method: 'POST', body })
  },
}

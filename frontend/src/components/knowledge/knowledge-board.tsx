'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { FileUp, Library, Link2, Loader2, Search } from 'lucide-react'
import { toast } from 'sonner'
import {
  knowledgeApi,
  type ConceptDetail,
  type ConceptSummary,
  type IngestResult,
  type SourceDetail,
  type SourceSummary,
} from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

/** Ingest form: upload a file or paste a URL, then run the pipeline. */
function IngestCard({ onDone }: { onDone: (result: IngestResult) => void }) {
  const [url, setUrl] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function run(action: () => Promise<IngestResult>) {
    setBusy(true)
    try {
      const result = await action()
      toast.success(
        `摄入完成:新增 ${result.created.length} 个概念,合并 ${result.merged.length} 个`,
      )
      setUrl('')
      setFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      onDone(result)
    } catch (e) {
      toast.error(`摄入失败:${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>添加资料</CardTitle>
        <CardDescription>
          上传文件或粘贴链接,自动提取摘要与核心概念并入库(约需 20–60 秒)。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="file">
          <TabsList>
            <TabsTrigger value="file">
              <FileUp /> 文件
            </TabsTrigger>
            <TabsTrigger value="url">
              <Link2 /> 链接
            </TabsTrigger>
          </TabsList>
          <TabsContent value="file" className="flex gap-2 pt-2">
            <Input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.txt,.md"
              disabled={busy}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <Button
              disabled={busy || !file}
              onClick={() => file && run(() => knowledgeApi.ingestFile(file))}
            >
              {busy ? <Loader2 className="animate-spin" /> : <FileUp />}
              {busy ? '处理中' : '摄入'}
            </Button>
          </TabsContent>
          <TabsContent value="url" className="flex gap-2 pt-2">
            <Input
              type="url"
              placeholder="https://..."
              value={url}
              disabled={busy}
              onChange={(e) => setUrl(e.target.value)}
            />
            <Button
              disabled={busy || !url}
              onClick={() => run(() => knowledgeApi.ingestUrl(url))}
            >
              {busy ? <Loader2 className="animate-spin" /> : <Link2 />}
              {busy ? '处理中' : '摄入'}
            </Button>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}

/** Concept detail dialog: full description plus every source that mentioned it. */
function ConceptDialog({
  conceptId,
  onClose,
}: {
  conceptId: string | null
  onClose: () => void
}) {
  const [detail, setDetail] = useState<ConceptDetail | null>(null)

  useEffect(() => {
    setDetail(null)
    if (!conceptId) return
    knowledgeApi
      .concept(conceptId)
      .then(setDetail)
      .catch((e) => toast.error((e as Error).message))
  }, [conceptId])

  return (
    <Dialog open={conceptId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        {detail ? (
          <>
            <DialogHeader>
              <DialogTitle>{detail.name}</DialogTitle>
              <DialogDescription>
                更新于 {formatDate(detail.updated_at)}
              </DialogDescription>
            </DialogHeader>
            <p className="text-sm leading-relaxed">{detail.description}</p>
            <div className="space-y-2">
              <h3 className="text-muted-foreground text-sm font-medium">
                来源({detail.sources.length})
              </h3>
              <ScrollArea className="max-h-64">
                <div className="space-y-3 pr-3">
                  {detail.sources.map((source) => (
                    <div key={source.id} className="rounded-md border p-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{source.title}</span>
                        <Badge variant="secondary">{source.source_type}</Badge>
                      </div>
                      <p className="text-muted-foreground mt-1 text-sm">
                        {source.concept_description}
                      </p>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </>
        ) : (
          <div className="space-y-3">
            <DialogHeader>
              <DialogTitle>
                <Skeleton className="h-6 w-48" />
              </DialogTitle>
            </DialogHeader>
            <Skeleton className="h-20 w-full" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** Source detail dialog: full summary plus the concepts extracted from it. */
function SourceDialog({
  sourceId,
  onClose,
  onOpenConcept,
}: {
  sourceId: string | null
  onClose: () => void
  onOpenConcept: (id: string) => void
}) {
  const [detail, setDetail] = useState<SourceDetail | null>(null)

  useEffect(() => {
    setDetail(null)
    if (!sourceId) return
    knowledgeApi
      .source(sourceId)
      .then(setDetail)
      .catch((e) => toast.error((e as Error).message))
  }, [sourceId])

  return (
    <Dialog open={sourceId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        {detail ? (
          <>
            <DialogHeader>
              <DialogTitle>{detail.title}</DialogTitle>
              <DialogDescription>
                {detail.source_type} · 摄入于 {formatDate(detail.created_at)}
                {detail.origin ? ` · ${detail.origin}` : ''}
              </DialogDescription>
            </DialogHeader>
            <p className="text-sm leading-relaxed">{detail.summary}</p>
            <div className="space-y-2">
              <h3 className="text-muted-foreground text-sm font-medium">
                提取的概念({detail.concepts.length})
              </h3>
              <div className="flex flex-wrap gap-2">
                {detail.concepts.map((concept) => (
                  <Badge
                    key={concept.id}
                    variant="outline"
                    className="cursor-pointer"
                    onClick={() => onOpenConcept(concept.id)}
                  >
                    {concept.name}
                  </Badge>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="space-y-3">
            <DialogHeader>
              <DialogTitle>
                <Skeleton className="h-6 w-48" />
              </DialogTitle>
            </DialogHeader>
            <Skeleton className="h-20 w-full" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function ListSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-28 w-full" />
      ))}
    </div>
  )
}

export function KnowledgeBoard() {
  const [concepts, setConcepts] = useState<ConceptSummary[] | null>(null)
  const [sources, setSources] = useState<SourceSummary[] | null>(null)
  const [search, setSearch] = useState('')
  const [openConcept, setOpenConcept] = useState<string | null>(null)
  const [openSource, setOpenSource] = useState<string | null>(null)

  const refresh = useCallback(() => {
    knowledgeApi
      .concepts()
      .then(setConcepts)
      .catch((e) => toast.error(`加载概念失败:${(e as Error).message}`))
    knowledgeApi
      .sources()
      .then(setSources)
      .catch((e) => toast.error(`加载来源失败:${(e as Error).message}`))
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const query = search.trim().toLowerCase()
  const filteredConcepts = concepts?.filter(
    (c) =>
      c.name.toLowerCase().includes(query) ||
      c.description.toLowerCase().includes(query),
  )

  return (
    <div className="flex flex-col gap-6">
      <IngestCard onDone={refresh} />

      <Tabs defaultValue="concepts">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="concepts">
              <Library /> 概念 {concepts ? `(${concepts.length})` : ''}
            </TabsTrigger>
            <TabsTrigger value="sources">
              <FileUp /> 来源 {sources ? `(${sources.length})` : ''}
            </TabsTrigger>
          </TabsList>
          <div className="relative">
            <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <Input
              className="w-56 pl-8"
              placeholder="搜索概念..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <TabsContent value="concepts" className="pt-3">
          {!filteredConcepts ? (
            <ListSkeleton />
          ) : filteredConcepts.length === 0 ? (
            <p className="text-muted-foreground py-12 text-center text-sm">
              {query ? '没有匹配的概念。' : '还没有概念,先在上方添加一份资料。'}
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {filteredConcepts.map((concept) => (
                <Card
                  key={concept.id}
                  className="hover:bg-accent/50 cursor-pointer gap-2 py-4 transition-colors"
                  onClick={() => setOpenConcept(concept.id)}
                >
                  <CardHeader className="px-4">
                    <CardTitle className="flex items-center justify-between gap-2 text-base">
                      <span className="truncate">{concept.name}</span>
                      <Badge variant="secondary">{concept.source_count} 来源</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4">
                    <p className="text-muted-foreground line-clamp-3 text-sm">
                      {concept.description}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="sources" className="pt-3">
          {!sources ? (
            <ListSkeleton />
          ) : sources.length === 0 ? (
            <p className="text-muted-foreground py-12 text-center text-sm">
              还没有来源,先在上方添加一份资料。
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {sources.map((source) => (
                <Card
                  key={source.id}
                  className="hover:bg-accent/50 cursor-pointer gap-2 py-4 transition-colors"
                  onClick={() => setOpenSource(source.id)}
                >
                  <CardHeader className="px-4">
                    <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                      <span>{source.title}</span>
                      <Badge variant="secondary">{source.source_type}</Badge>
                      <Badge variant="outline">{source.concept_count} 概念</Badge>
                      <span className="text-muted-foreground ml-auto text-xs font-normal">
                        {formatDate(source.created_at)}
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4">
                    <p className="text-muted-foreground line-clamp-2 text-sm">
                      {source.summary}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <ConceptDialog conceptId={openConcept} onClose={() => setOpenConcept(null)} />
      <SourceDialog
        sourceId={openSource}
        onClose={() => setOpenSource(null)}
        onOpenConcept={(id) => {
          setOpenSource(null)
          setOpenConcept(id)
        }}
      />
    </div>
  )
}

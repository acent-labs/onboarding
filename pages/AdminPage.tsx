import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  getAllProgress,
  getProgress,
  getProducts,
  getProgressSummary,
  listDocuments,
  deleteDocument,
  SessionSummary,
  DocumentInfo,
  UserProgress,
} from '../services/apiClient';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import LoadingSpinner from '../components/LoadingSpinner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import type { ProgressSummary } from '../types';

type Tab = 'users' | 'documents';

// 사용자별 통합 데이터 (백엔드에서 사용자당 하나의 세션만 반환)
interface UserSummary {
  userName: string;
  sessionsCount: number;       // 항상 1 (백엔드에서 세션 통합)
  totalCompleted: number;
  totalScenarios: number;      // 전체 시나리오/모듈 수 (백엔드에서 제공)
  completionRate: number;
  sessionId: string;           // 사용자의 통합된 세션 ID
  lastActivity?: string;
}

const AdminPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('users');
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [isUsersLoading, setIsUsersLoading] = useState(false);
  const [isDocumentsLoading, setIsDocumentsLoading] = useState(false);
  const [usersLoaded, setUsersLoaded] = useState(false);
  const [documentsLoaded, setDocumentsLoaded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [deletingDocName, setDeletingDocName] = useState<string | null>(null);

  // 상세 모니터링(드릴다운)
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserSummary | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [, setScenarioProgress] = useState<UserProgress | null>(null);
  const [showSessionPicker, setShowSessionPicker] = useState(false);
  const [visibleUserCount, setVisibleUserCount] = useState(50);
  const [curriculumSummaries, setCurriculumSummaries] = useState<
    Array<{ productId: string; productName: string; summary: ProgressSummary | null; error?: string; loading?: boolean }>
  >([]);
  const [loadedProducts, setLoadedProducts] = useState<Set<string>>(new Set());

  const USERS_CACHE_KEY = 'admin.usersProgress.v1';
  const USERS_CACHE_TTL_MS = 5 * 60 * 1000; // 5분

  const readUsersCache = ():
    | { sessions: SessionSummary[]; cachedAt: number }
    | null => {
    try {
      const raw = localStorage.getItem(USERS_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { sessions?: SessionSummary[]; cachedAt?: number };
      if (!Array.isArray(parsed.sessions) || typeof parsed.cachedAt !== 'number') return null;
      return { sessions: parsed.sessions, cachedAt: parsed.cachedAt };
    } catch {
      return null;
    }
  };

  const writeUsersCache = (nextSessions: SessionSummary[]) => {
    try {
      localStorage.setItem(
        USERS_CACHE_KEY,
        JSON.stringify({ sessions: nextSessions, cachedAt: Date.now() })
      );
    } catch {
      // ignore quota / private mode
    }
  };

  const getProductDisplayName = (productId: string, candidate?: string) => {
    const overrides: Record<string, string> = {
      freshservice: 'Freshservice',
      freshdesk: 'Freshdesk',
      freshdesk_omni: 'Freshdesk Omni',
      freshsales: 'Freshsales',
      freshchat: 'Freshchat',
    };
    const trimmed = (candidate || '').trim();
    if (trimmed && trimmed !== productId) return trimmed;
    return overrides[productId] || productId.replace(/_/g, ' ');
  };

  const loadUserProgress = useCallback(async (force = false) => {
    if (!force && usersLoaded) return;

    // 캐시가 있으면 즉시 표시(체감 개선) 후 백그라운드 동기화
    if (!force) {
      const cached = readUsersCache();
      if (cached && Date.now() - cached.cachedAt <= USERS_CACHE_TTL_MS && sessions.length === 0) {
        setSessions(cached.sessions);
        setUsersLoaded(true);
      }
    }

    setIsUsersLoading(true);
    try {
      const t0 = import.meta.env.DEV ? performance.now() : 0;
      const data = await getAllProgress();
      if (import.meta.env.DEV) {
        const ms = Math.round(performance.now() - t0);
        // eslint-disable-next-line no-console
        console.debug(`[Admin] getAllProgress: ${ms}ms`);
      }
      setSessions(data.sessions || []);
      writeUsersCache(data.sessions || []);
      setUsersLoaded(true);
    } catch (error) {
      console.error('Failed to load user progress:', error);
    } finally {
      setIsUsersLoading(false);
    }
  }, [usersLoaded, sessions.length]);

  const loadDocuments = useCallback(async (force = false) => {
    if (!force && documentsLoaded) return;
    setIsDocumentsLoading(true);
    try {
      const docs = await listDocuments();
      setDocuments(docs);
      setDocumentsLoaded(true);
    } catch (error) {
      console.error('Failed to load documents:', error);
    } finally {
      setIsDocumentsLoading(false);
    }
  }, [documentsLoaded]);

  useEffect(() => {
    if (activeTab === 'users') {
      loadUserProgress();
    } else {
      loadDocuments();
    }
  }, [activeTab, loadUserProgress, loadDocuments]);

  const handleDeleteDocument = async (docName: string, displayName: string) => {
    if (!confirm(`"${displayName}" 문서를 삭제하시겠습니까?`)) return;

    setDeletingDocName(docName);
    try {
      await deleteDocument(docName);
      await loadDocuments(true);
    } catch (error) {
      console.error('Delete failed:', error);
      alert('삭제에 실패했습니다.');
    } finally {
      setDeletingDocName(null);
    }
  };

  const getMetadataValue = (doc: DocumentInfo, key: string): string => {
    const meta = doc.customMetadata?.find(m => m.key === key);
    return meta?.stringValue || '';
  };

  const formatDateTime = (value?: string | null) => {
    if (!value) return '-';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleString('ko-KR');
  };

  const toTime = (value?: string | null) => {
    if (!value) return 0;
    const t = new Date(value).getTime();
    return Number.isNaN(t) ? 0 : t;
  };

  const openUserDetail = async (user: UserSummary) => {
    setSelectedUser(user);
    setSelectedSessionId(user.sessionId);
    setShowSessionPicker(false);
    setIsDetailOpen(true);
  };

  const loadDetail = useCallback(async () => {
    if (!selectedSessionId) return;

    setDetailLoading(true);
    setDetailError(null);
    setScenarioProgress(null);
    setCurriculumSummaries([]);
    setLoadedProducts(new Set());

    try {
      // 1) 시나리오 기반 온보딩 진행만 즉시 로드
      const scenario = await getProgress(selectedSessionId);
      setScenarioProgress(scenario);

      // 2) 제품 목록만 가져와서 빈 상태로 초기화 (지연 로딩 준비)
      const products = await getProducts();
      const productList = (products as any[])
        .map((p) => ({
          id: String(p.id),
          name: String(p.name || p.name_ko || p.id),
          productType: p.product_type as string | undefined,
        }))
        .filter((p) => !!p.id);

      // 제품 목록 설정 (로딩 상태로 초기화)
      setCurriculumSummaries(
        productList.map(p => ({
          productId: p.id,
          productName: p.name,
          summary: null,
          loading: true,
        }))
      );

      // 모든 제품의 진행률을 병렬로 미리 로드
      const summaryResults = await Promise.allSettled(
        productList.map(async (p) => {
          const summary = await getProgressSummary(selectedSessionId, p.id);
          return { productId: p.id, productName: p.name, summary };
        })
      );

      // 결과 반영
      const loadedProductIds = new Set<string>();
      setCurriculumSummaries(
        summaryResults.map((result, idx) => {
          const p = productList[idx];
          if (result.status === 'fulfilled') {
            loadedProductIds.add(p.id);
            return {
              productId: p.id,
              productName: p.name,
              summary: result.value.summary,
              loading: false,
            };
          } else {
            return {
              productId: p.id,
              productName: p.name,
              summary: null,
              loading: false,
              error: '진도 조회 실패',
            };
          }
        })
      );
      setLoadedProducts(loadedProductIds);
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : '상세 정보를 불러오지 못했습니다.');
    } finally {
      setDetailLoading(false);
    }
  }, [selectedSessionId, selectedUser]);

  // 개별 제품 커리큘럼 로드 (Accordion 펼칠 때 호출)
  const loadProductCurriculum = useCallback(async (productId: string) => {
    if (!selectedSessionId || loadedProducts.has(productId)) return;

    // 로딩 상태 설정
    setCurriculumSummaries(prev =>
      prev.map(p => p.productId === productId ? { ...p, loading: true } : p)
    );

    try {
      const summary = await getProgressSummary(selectedSessionId, productId);

      setCurriculumSummaries(prev =>
        prev.map(p => p.productId === productId
          ? { ...p, summary, loading: false, error: undefined }
          : p
        )
      );

      setLoadedProducts(prev => new Set(prev).add(productId));
    } catch (e) {
      const msg = e instanceof Error ? e.message : '진도 조회 실패';
      setCurriculumSummaries(prev =>
        prev.map(p => p.productId === productId
          ? { ...p, summary: null, loading: false, error: msg }
          : p
        )
      );
    }
  }, [selectedSessionId, loadedProducts]);

  useEffect(() => {
    if (!isDetailOpen) return;
    loadDetail();
  }, [isDetailOpen, loadDetail]);

  // 사용자별 세션 (백엔드에서 이미 사용자당 하나의 세션으로 통합됨)
  const userSummaries = useMemo(() => {
    return sessions.map(session => ({
      userName: session.userName || '익명',
      sessionsCount: 1,  // 백엔드에서 세션 통합됨
      totalCompleted: session.completedCount,
      totalScenarios: session.totalScenarios,
      completionRate: session.completionRate,
      sessionId: session.sessionId,
      lastActivity: session.lastActivity,
    })).sort((a, b) => {
      // 1) 진행률 높은 순
      const byRate = b.completionRate - a.completionRate;
      if (byRate !== 0) return byRate;
      // 2) 최근 활동 높은 순
      return toTime(b.lastActivity) - toTime(a.lastActivity);
    });
  }, [sessions]);

  const selectedSessionsSorted = useMemo(() => {
    if (!selectedUser?.userName) return [];
    const name = selectedUser.userName;
    const list = sessions.filter((s) => (s.userName || '익명') === name);
    list.sort((a, b) => toTime(b.lastActivity) - toTime(a.lastActivity));
    return list;
  }, [selectedUser?.userName, sessions]);

  const sessionSelectLimit = 30;
  const selectedSessionsForSelect = selectedSessionsSorted.slice(0, sessionSelectLimit);
  const hiddenSessionCount = Math.max(0, selectedSessionsSorted.length - selectedSessionsForSelect.length);

  const formatSessionLabel = (s: SessionSummary) => {
    const head = s.sessionId?.slice(0, 8) || 'session';
    const tail = s.sessionId?.slice(-4) || '';
    const activity = s.lastActivity ? formatDateTime(s.lastActivity) : '활동 기록 없음';
    return `${head}…${tail} · ${activity}`;
  };

  // Filter users by search
  const filteredUsers = userSummaries.filter(u =>
    u.userName?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  useEffect(() => {
    // 검색 조건 변경 시 렌더 부담을 줄이기 위해 표시 개수 초기화
    setVisibleUserCount(50);
  }, [searchQuery, activeTab]);

  const displayedUsers = filteredUsers.slice(0, visibleUserCount);

  // Filter documents by search
  const filteredDocuments = documents.filter(doc => {
    const displayName = doc.displayName?.toLowerCase() || '';
    const tags = getMetadataValue(doc, 'tags').toLowerCase();
    return displayName.includes(searchQuery.toLowerCase()) || tags.includes(searchQuery.toLowerCase());
  });

  const isTabLoading = activeTab === 'users' ? isUsersLoading : isDocumentsLoading;
  const handleRefresh = async () => {
    if (activeTab === 'users') {
      await loadUserProgress(true);
    } else {
      await loadDocuments(true);
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto space-y-8 px-2 sm:px-4">
      {/* Tabs */}
      <Card>
        <div className="border-b border-border">
          <nav className="flex">
            <Button
              variant="ghost"
              onClick={() => setActiveTab('users')}
              className={`px-6 py-4 text-sm font-medium rounded-none ${activeTab === 'users'
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-muted-foreground'
                }`}
            >
              <i className="fas fa-users mr-2" />
              사용자 진행 현황
            </Button>
            <Button
              variant="ghost"
              onClick={() => setActiveTab('documents')}
              className={`px-6 py-4 text-sm font-medium rounded-none ${activeTab === 'documents'
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-muted-foreground'
                }`}
            >
              <i className="fas fa-folder-open mr-2" />
              문서 관리
            </Button>
          </nav>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-border flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <input
            type="text"
            placeholder={activeTab === 'users' ? '사용자 검색...' : '문서 검색...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full sm:max-w-md px-4 py-2 bg-muted border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring text-foreground placeholder-muted-foreground"
          />

          <div className="flex items-center gap-2">
            {isTabLoading && (sessions.length > 0 || documents.length > 0) ? (
              <span className="text-xs text-muted-foreground">동기화 중…</span>
            ) : null}
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isTabLoading}>
              새로고침
            </Button>
          </div>
        </div>

        {/* Content */}
        <CardContent>
          {activeTab === 'users' ? (
            isUsersLoading && sessions.length === 0 ? (
              <div className="py-8 text-center">
                <LoadingSpinner message="사용자 진행 현황을 불러오는 중..." />
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                <i className="fas fa-users text-3xl mb-2" />
                <p>사용자 데이터가 없습니다.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-sm text-muted-foreground border-b border-border">
                      <th className="pb-3 font-medium">사용자</th>
                      <th className="pb-3 font-medium">완료 시나리오</th>
                      <th className="pb-3 font-medium">진행률</th>
                      <th className="pb-3 font-medium">상태</th>
                      <th className="pb-3 font-medium text-right">상세</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {displayedUsers.map((user, idx) => (
                      <tr key={idx} className="text-sm">
                        <td className="py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm">
                              {user.userName[0].toUpperCase()}
                            </div>
                            <div>
                              <p className="font-medium text-foreground">
                                {user.userName}
                              </p>
                              <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1">
                                <span>최근 활동: {formatDateTime(user.lastActivity)}</span>
                                {user.sessionsCount > 1 ? (
                                  <span title="세션은 사용자가 앱을 시작/로그인할 때 생성되는 방문(세션) 기록입니다. 브라우저/기기/재로그인/테스트에 따라 많아질 수 있습니다.">
                                    세션 기록: {user.sessionsCount}개
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 text-foreground">
                          {user.totalCompleted} / {user.totalScenarios}
                        </td>
                        <td className="py-4">
                          <div className="flex items-center gap-2">
                            <Progress value={user.completionRate} className="w-32 h-2" />
                            <span className="text-foreground">
                              {user.completionRate}%
                            </span>
                          </div>
                        </td>
                        <td className="py-4">
                          {user.completionRate === 100 ? (
                            <Badge variant="default" className="bg-green-500/20 text-green-600 hover:bg-green-500/20 border border-green-500/30">
                              완료
                            </Badge>
                          ) : user.totalCompleted > 0 ? (
                            <Badge variant="default" className="bg-blue-500/20 text-blue-600 hover:bg-blue-500/20 border border-blue-500/30">
                              진행 중
                            </Badge>
                          ) : (
                            <Badge variant="secondary">
                              시작 전
                            </Badge>
                          )}
                        </td>
                        <td className="py-4 text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openUserDetail(user)}
                          >
                            상세보기
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {filteredUsers.length > displayedUsers.length ? (
                  <div className="py-4 flex items-center justify-between">
                    <div className="text-xs text-muted-foreground">
                      {displayedUsers.length} / {filteredUsers.length}명 표시 중
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setVisibleUserCount((n) => Math.min(filteredUsers.length, n + 50))}
                    >
                      더 보기
                    </Button>
                  </div>
                ) : null}
              </div>
            )
          ) : (
            isDocumentsLoading && documents.length === 0 ? (
              <div className="py-8 text-center">
                <LoadingSpinner message="문서 목록을 불러오는 중..." />
              </div>
            ) : filteredDocuments.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                <i className="fas fa-folder-open text-3xl mb-2" />
                <p>문서가 없습니다.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredDocuments.map((doc) => {
                  const category = getMetadataValue(doc, 'category');
                  const author = getMetadataValue(doc, 'author');
                  const tags = getMetadataValue(doc, 'tags');

                  return (
                    <div
                      key={doc.name}
                      className="flex items-center justify-between p-3 bg-muted rounded-lg border border-border hover:border-primary/30 transition-colors"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="w-10 h-10 bg-background rounded-lg flex items-center justify-center border border-border">
                          <i className="fas fa-file-alt text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-foreground truncate">
                            {doc.displayName || doc.name}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            {category && <span className="capitalize">{category}</span>}
                            {author && <span>by {author}</span>}
                            {tags && <span>#{tags.split(',')[0]}</span>}
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDeleteDocument(doc.name, doc.displayName || doc.name)}
                        disabled={deletingDocName === doc.name}
                        aria-label={`${doc.displayName || doc.name} 문서 삭제`}
                        title="삭제"
                      >
                        <i className="fas fa-trash" />
                        {deletingDocName === doc.name ? '삭제 중…' : '삭제'}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )
          )}
        </CardContent>
      </Card>

      {/* 상세 모니터링 다이얼로그 */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-none w-[min(96vw,900px)] h-[min(96vh,900px)] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>사용자 진행 현황 상세</DialogTitle>
            <DialogDescription>
              시나리오(온보딩)와 커리큘럼(모듈) 진행 상태를 세션 기준으로 확인합니다.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <div className="text-sm text-muted-foreground">사용자</div>
                <div className="text-base font-semibold text-foreground">{selectedUser?.userName || '-'}</div>
                {selectedUser?.lastActivity ? (
                  <div className="text-xs text-muted-foreground">최근 활동: {formatDateTime(selectedUser.lastActivity)}</div>
                ) : null}
              </div>

              <div className="space-y-1">
                <div className="text-sm text-muted-foreground">기준 세션</div>

                {!showSessionPicker ? (
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <div className="h-9 px-3 bg-muted border border-input rounded-md text-sm flex items-center w-full">
                      <span className="text-foreground truncate">
                        {selectedSessionId ? `${selectedSessionId.slice(0, 8)}…${selectedSessionId.slice(-4)}` : '-'}
                      </span>
                    </div>
                    {(selectedUser?.sessionsCount || 0) > 1 ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowSessionPicker(true)}
                        title="세션 변경(고급)"
                      >
                        세션 변경
                      </Button>
                    ) : null}
                    <Button variant="outline" size="sm" onClick={loadDetail} disabled={detailLoading}>
                      새로고침
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                      <select
                        value={selectedSessionId}
                        onChange={(e) => setSelectedSessionId(e.target.value)}
                        className="h-9 px-3 bg-muted border border-input rounded-md text-sm w-full"
                      >
                        {selectedSessionsForSelect.map((s) => (
                          <option key={s.sessionId} value={s.sessionId}>
                            {formatSessionLabel(s)}
                          </option>
                        ))}
                      </select>
                      <Button variant="outline" size="sm" onClick={() => setShowSessionPicker(false)}>
                        닫기
                      </Button>
                      <Button variant="outline" size="sm" onClick={loadDetail} disabled={detailLoading}>
                        새로고침
                      </Button>
                    </div>
                    {hiddenSessionCount > 0 ? (
                      <div className="text-xs text-muted-foreground">
                        세션이 너무 많아 최근 {sessionSelectLimit}개만 표시합니다. (숨김 {hiddenSessionCount}개)
                      </div>
                    ) : null}
                    <div className="text-xs text-muted-foreground">
                      세션은 사용자가 앱을 시작/로그인할 때 생성되는 방문 기록입니다. 대표 확인용으로는 기본 세션만 봐도 충분하며,
                      데이터가 안 보일 때만 세션을 바꿔 확인하면 됩니다.
                    </div>
                  </div>
                )}
              </div>
            </div>

            {detailError && (
              <div className="p-3 rounded-md border border-destructive/40 bg-destructive/10 text-sm text-destructive">
                {detailError}
              </div>
            )}

            {detailLoading ? (
              <div className="py-10 text-center">
                <LoadingSpinner message="상세 데이터를 불러오는 중..." />
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-8">
                {/* 커리큘럼 진행 (Admin 화면에서는 커리큘럼 진행률만 표시) */}
                <Card className="h-fit">
                  <CardContent className="pt-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-foreground">커리큘럼(모듈) 진행</h3>
                      <Badge variant="outline">제품별</Badge>
                    </div>

                    {curriculumSummaries.length === 0 ? (
                      <div className="text-sm text-muted-foreground">커리큘럼 진도 데이터가 없습니다.</div>
                    ) : (
                      <div className="max-h-[52vh] overflow-y-auto pr-1">
                        <Accordion
                          type="single"
                          collapsible
                          className="w-full"
                          onValueChange={(value) => {
                            if (value) loadProductCurriculum(value);
                          }}
                        >
                        {curriculumSummaries.map((p) => {
                          const rate = p.summary?.completionRate || 0;
                          const completed = p.summary?.completedModules || 0;
                          const inProgress = p.summary?.inProgressModules || 0;
                          const total = p.summary?.totalModules || 0;
                          // 진행 중인 모듈도 포함한 표시: 완료 + 진행 중 / 전체
                          const totalWithProgress = completed + inProgress;

                          return (
                            <AccordionItem key={p.productId} value={p.productId}>
                              <AccordionTrigger>
                                <div className="flex items-center justify-between w-full pr-3">
                                  <div className="min-w-0">
                                    <div className="font-medium text-foreground truncate">{getProductDisplayName(p.productId, p.productName)}</div>
                                    <div className="text-xs text-muted-foreground truncate">{p.productId}</div>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <div className="text-xs text-muted-foreground whitespace-nowrap">
                                      {totalWithProgress > 0 ? `${completed}+${inProgress}` : completed}/{total}
                                    </div>
                                    <div className="w-28">
                                      <Progress value={rate} className="h-2" />
                                    </div>
                                    <div className="text-sm font-medium text-foreground whitespace-nowrap">
                                      {Math.round(rate)}%
                                    </div>
                                  </div>
                                </div>
                              </AccordionTrigger>
                              <AccordionContent>
                                {p.loading ? (
                                  <div className="py-6 text-center">
                                    <LoadingSpinner message="진도 데이터를 불러오는 중..." />
                                  </div>
                                ) : p.error ? (
                                  <div className="mb-3 p-2 rounded-md bg-destructive/10 border border-destructive/30 text-sm text-destructive">
                                    {p.error}
                                  </div>
                                ) : !p.summary ? (
                                  <div className="text-sm text-muted-foreground">요약 데이터를 불러오지 못했습니다.</div>
                                ) : (
                                  <div className="space-y-3">
                                    <div className="grid grid-cols-3 gap-3">
                                      <div className="p-3 rounded-md bg-muted/40 border border-border">
                                        <div className="text-xs text-muted-foreground">완료</div>
                                        <div className="text-lg font-semibold text-foreground">{p.summary.completedModules}</div>
                                      </div>
                                      <div className="p-3 rounded-md bg-muted/40 border border-border">
                                        <div className="text-xs text-muted-foreground">진행 중</div>
                                        <div className="text-lg font-semibold text-foreground">{p.summary.inProgressModules}</div>
                                      </div>
                                      <div className="p-3 rounded-md bg-muted/40 border border-border">
                                        <div className="text-xs text-muted-foreground">전체 모듈</div>
                                        <div className="text-lg font-semibold text-foreground">{p.summary.totalModules}</div>
                                      </div>
                                    </div>

                                    <div className="overflow-x-auto">
                                      <table className="w-full text-sm">
                                        <thead>
                                          <tr className="text-left text-xs text-muted-foreground border-b border-border">
                                            <th className="py-2 font-medium">모듈</th>
                                            <th className="py-2 font-medium">상태</th>
                                            <th className="py-2 font-medium">점수</th>
                                            <th className="py-2 font-medium">시도</th>
                                            <th className="py-2 font-medium">완료일</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border">
                                          {p.summary.modules.map((m) => (
                                            <tr key={m.id}>
                                              <td className="py-2">
                                                <div className="font-medium text-foreground">{m.nameKo}</div>
                                                <div className="text-xs text-muted-foreground">{m.slug}</div>
                                              </td>
                                              <td className="py-2">
                                                {m.status === 'completed' ? (
                                                  <Badge className="bg-green-500/20 text-green-600 hover:bg-green-500/20 border border-green-500/30">완료</Badge>
                                                ) : m.status === 'learning' ? (
                                                  <Badge className="bg-blue-500/20 text-blue-600 hover:bg-blue-500/20 border border-blue-500/30">진행</Badge>
                                                ) : (
                                                  <Badge variant="secondary">미시작</Badge>
                                                )}
                                              </td>
                                              <td className="py-2 text-foreground">{m.quizScore ?? '-'}</td>
                                              <td className="py-2 text-foreground">{m.quizAttempts ?? '-'}</td>
                                              <td className="py-2 text-muted-foreground">{formatDateTime(m.completedAt)}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                )}
                              </AccordionContent>
                            </AccordionItem>
                          );
                        })}
                        </Accordion>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminPage;

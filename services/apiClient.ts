/**
 * Agent Platform 백엔드 API 클라이언트
 * Gemini 직접 호출 대신 백엔드를 통해 안전하게 AI 기능 사용
 */

import { getAccessToken } from './supabaseClient';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';

interface ApiError {
  message: string;
  status: number;
}

class ApiClientError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = 'ApiClientError';
  }
}

/**
 * 인증 헤더 가져오기
 */
async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  if (token) {
    return { Authorization: `Bearer ${token}` };
  }
  return {};
}

async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  const authHeaders = await getAuthHeaders();
  const defaultHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...authHeaders,
  };

  const response = await fetch(url, {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
    throw new ApiClientError(
      errorData.detail?.message || errorData.detail || errorData.message || 'API Error',
      response.status
    );
  }

  return response.json();
}

// ============================================
// 세션 관리
// ============================================

export interface CreateSessionResponse {
  sessionId: string;
  message?: string;
}

export async function createSession(userName: string): Promise<CreateSessionResponse> {
  return apiFetch<CreateSessionResponse>('/onboarding/session', {
    method: 'POST',
    body: JSON.stringify({ userName }),
  });
}

// ============================================
// 채팅 (스트리밍)
// ============================================

export interface ChatStreamEvent {
  event: 'chunk' | 'result' | 'error';
  data: {
    text?: string;
    message?: string;
  };
}

export async function* streamChat(
  sessionId: string,
  message: string
): AsyncGenerator<ChatStreamEvent> {
  const url = `${API_BASE_URL}/onboarding/chat/stream?sessionId=${encodeURIComponent(sessionId)}&query=${encodeURIComponent(message)}`;

  const authHeaders = await getAuthHeaders();
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Accept': 'text/event-stream',
      ...authHeaders,
    },
  });
  
  if (!response.ok) {
    throw new ApiClientError('Chat stream failed', response.status);
  }
  
  const reader = response.body?.getReader();
  if (!reader) {
    throw new ApiClientError('No response body', 500);
  }
  
  const decoder = new TextDecoder();
  let buffer = '';
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        const eventType = line.slice(7).trim();
        continue;
      }
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6));
          yield { event: data.event || 'chunk', data };
        } catch {
          // Skip invalid JSON
        }
      }
    }
  }
}

// ============================================
// 시나리오 피드백 (스트리밍)
// ============================================

export interface FeedbackRequest {
  sessionId: string;
  scenarioId: string;
  scenarioTitle: string;
  scenarioDescription: string;
  allChoices: string[];
  selectedChoice: string;
  userName: string;
}

export interface FeedbackStreamEvent {
  event: 'feedback_chunk' | 'questions' | 'result' | 'error';
  data: {
    text?: string;
    questions?: string[];
    message?: string;
  };
}

export async function* streamFeedback(
  request: FeedbackRequest
): AsyncGenerator<FeedbackStreamEvent> {
  const params = new URLSearchParams({
    sessionId: request.sessionId,
    scenarioId: request.scenarioId,
    scenarioTitle: request.scenarioTitle,
    scenarioDescription: request.scenarioDescription,
    selectedChoice: request.selectedChoice,
    userName: request.userName,
  });
  
  // 배열 파라미터 추가
  request.allChoices.forEach(choice => {
    params.append('allChoices', choice);
  });
  
  const url = `${API_BASE_URL}/onboarding/feedback/stream?${params.toString()}`;

  const authHeaders = await getAuthHeaders();
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Accept': 'text/event-stream',
      ...authHeaders,
    },
  });
  
  if (!response.ok) {
    throw new ApiClientError('Feedback stream failed', response.status);
  }
  
  const reader = response.body?.getReader();
  if (!reader) {
    throw new ApiClientError('No response body', 500);
  }
  
  const decoder = new TextDecoder();
  let buffer = '';
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6));
          yield { event: data.event || 'feedback_chunk', data };
        } catch {
          // Skip invalid JSON
        }
      }
    }
  }
}

// ============================================
// 후속 질문 답변 (스트리밍)
// ============================================

export interface FollowUpRequest {
  sessionId: string;
  scenarioId: string;
  scenarioTitle: string;
  scenarioDescription: string;
  originalFeedback: string;
  question: string;
  userName: string;
}

export async function* streamFollowUp(
  request: FollowUpRequest
): AsyncGenerator<ChatStreamEvent> {
  const params = new URLSearchParams({
    sessionId: request.sessionId,
    scenarioId: request.scenarioId,
    scenarioTitle: request.scenarioTitle,
    scenarioDescription: request.scenarioDescription,
    originalFeedback: request.originalFeedback,
    question: request.question,
    userName: request.userName,
  });
  
  const url = `${API_BASE_URL}/onboarding/followup/stream?${params.toString()}`;

  const authHeaders = await getAuthHeaders();
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Accept': 'text/event-stream',
      ...authHeaders,
    },
  });
  
  if (!response.ok) {
    throw new ApiClientError('Follow-up stream failed', response.status);
  }
  
  const reader = response.body?.getReader();
  if (!reader) {
    throw new ApiClientError('No response body', 500);
  }
  
  const decoder = new TextDecoder();
  let buffer = '';
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6));
          yield { event: data.event || 'chunk', data };
        } catch {
          // Skip invalid JSON
        }
      }
    }
  }
}

// ============================================
// 진행도 관리
// ============================================

export interface ProgressRecord {
  scenarioId: string;
  completedAt: string;
  choiceId: string;
  feedbackRating?: number;
}

export interface UserProgress {
  userId: string;
  userName: string;
  completedScenarios: ProgressRecord[];
  totalScenarios: number;
  completionRate: number;
}

export async function saveProgress(
  sessionId: string,
  scenarioId: string,
  choiceId: string,
  feedbackRating?: number
): Promise<{ success: boolean }> {
  return apiFetch('/onboarding/progress', {
    method: 'POST',
    body: JSON.stringify({
      sessionId,
      scenarioId,
      choiceId,
      feedbackRating,
    }),
  });
}

export async function getProgress(sessionId: string): Promise<UserProgress> {
  return apiFetch(`/onboarding/progress/${encodeURIComponent(sessionId)}`);
}

// ============================================
// 관리자 API
// ============================================

export interface SessionSummary {
  sessionId: string;
  userName: string;
  completedCount: number;
  totalScenarios: number;
  completionRate: number;
  lastActivity?: string;
}

export interface AllSessionsResponse {
  sessions: SessionSummary[];
}

export async function getAllProgress(): Promise<AllSessionsResponse> {
  return apiFetch('/onboarding/progress');
}

// ============================================
// 문서 관리 (File Search)
// ============================================

export interface DocumentInfo {
  name: string;
  displayName: string;
  customMetadata?: { key: string; stringValue: string }[];
}

export interface DocumentsListResponse {
  documents: DocumentInfo[];
  nextPageToken?: string;
}

export async function listDocuments(): Promise<DocumentInfo[]> {
  try {
    // 1. 스토어 목록 조회
    const storesResponse = await apiFetch<{ stores: { name: string, displayName: string }[] }>('/file-search/stores');
    
    if (!storesResponse.stores || storesResponse.stores.length === 0) {
      return [];
    }

    // 2. 'onboarding'이 포함된 스토어 찾기 또는 첫 번째 스토어 사용
    const store = storesResponse.stores.find(s => s.displayName.toLowerCase().includes('onboarding')) || storesResponse.stores[0];
    
    // 3. 문서 목록 조회
    const response = await apiFetch<DocumentsListResponse>(`/file-search/stores/${encodeURIComponent(store.name)}/documents`);
    return response.documents || [];
  } catch (error) {
    console.error('Failed to list documents:', error);
    return [];
  }
}

export async function deleteDocument(documentName: string): Promise<void> {
  await apiFetch(`/file-search/documents/${encodeURIComponent(documentName)}`, {
    method: 'DELETE',
  });
}

// ============================================
// 지식 베이스 (Knowledge Base)
// ============================================

export interface KnowledgeArticle {
  id: string;
  title: string;
  author: string;
  category: string;  // handover, process, tips, company, tools, etc
  rawContent: string;
  structuredSummary?: string;
  createdAt: string;
}

export interface CreateKnowledgeArticleRequest {
  title: string;
  author: string;
  category: string;
  rawContent: string;
  structuredSummary: string;
}

export interface UpdateKnowledgeArticleRequest {
  title?: string;
  author?: string;
  category?: string;
  rawContent?: string;
  structuredSummary?: string;
}

/**
 * AI를 사용하여 지식 콘텐츠 구조화
 */
export async function structureKnowledge(rawContent: string, category: string): Promise<string> {
  const result = await apiFetch<{ structuredSummary: string }>('/onboarding/knowledge/structure', {
    method: 'POST',
    body: JSON.stringify({ rawContent, category }),
  });
  return result.structuredSummary;
}

/**
 * 지식 아티클 목록 조회
 */
export async function getKnowledgeArticles(category?: string): Promise<KnowledgeArticle[]> {
  const params = category ? `?category=${encodeURIComponent(category)}` : '';
  return apiFetch<KnowledgeArticle[]>(`/onboarding/knowledge${params}`);
}

/**
 * 지식 아티클 생성
 */
export async function createKnowledgeArticle(request: CreateKnowledgeArticleRequest): Promise<KnowledgeArticle> {
  return apiFetch<KnowledgeArticle>('/onboarding/knowledge', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

/**
 * 지식 아티클 수정
 */
export async function updateKnowledgeArticle(articleId: string, request: UpdateKnowledgeArticleRequest): Promise<KnowledgeArticle> {
  return apiFetch<KnowledgeArticle>(`/onboarding/knowledge/${encodeURIComponent(articleId)}`, {
    method: 'PUT',
    body: JSON.stringify(request),
  });
}

/**
 * 지식 아티클 삭제
 */
export async function deleteKnowledgeArticle(articleId: string): Promise<{ success: boolean }> {
  return apiFetch(`/onboarding/knowledge/${encodeURIComponent(articleId)}`, {
    method: 'DELETE',
  });
}

// ============================================
// 제품별 지식 학습 (Product Knowledge) API
// ============================================

import type {
  Product,
  ProductCategory,
  ProductFolder,
  ProductDocument,
  ProductStats,
} from '../types';

/**
 * 지원 제품 목록 조회
 */
export async function getProducts(): Promise<Product[]> {
  return apiFetch<Product[]>('/onboarding/products');
}

/**
 * 단일 제품 정보 조회
 */
export async function getProduct(productId: string): Promise<Product> {
  return apiFetch<Product>(`/onboarding/products/${encodeURIComponent(productId)}`);
}

/**
 * 제품별 카테고리 목록 조회
 */
export async function getProductCategories(productId: string): Promise<ProductCategory[]> {
  return apiFetch<ProductCategory[]>(
    `/onboarding/products/${encodeURIComponent(productId)}/categories`
  );
}

/**
 * 단일 카테고리 정보 조회
 */
export async function getProductCategory(
  productId: string,
  categorySlug: string
): Promise<ProductCategory> {
  return apiFetch<ProductCategory>(
    `/onboarding/products/${encodeURIComponent(productId)}/categories/${encodeURIComponent(categorySlug)}`
  );
}

/**
 * 카테고리 내 폴더 목록 조회
 */
export async function getCategoryFolders(
  productId: string,
  categorySlug: string
): Promise<ProductFolder[]> {
  return apiFetch<ProductFolder[]>(
    `/onboarding/products/${encodeURIComponent(productId)}/categories/${encodeURIComponent(categorySlug)}/folders`
  );
}

/**
 * 카테고리 내 문서 목록 조회
 */
export async function getCategoryDocuments(
  productId: string,
  categorySlug: string,
  limit: number = 50
): Promise<ProductDocument[]> {
  return apiFetch<ProductDocument[]>(
    `/onboarding/products/${encodeURIComponent(productId)}/categories/${encodeURIComponent(categorySlug)}/documents?limit=${limit}`
  );
}

/**
 * 제품별 문서 통계 조회
 */
export async function getProductStats(productId: string): Promise<ProductStats> {
  return apiFetch<ProductStats>(
    `/onboarding/products/${encodeURIComponent(productId)}/stats`
  );
}

/**
 * 카테고리별 학습 콘텐츠 스트리밍
 */
export async function* streamCategoryLearning(
  productId: string,
  categorySlug: string
): AsyncGenerator<ChatStreamEvent> {
  const url = `${API_BASE_URL}/onboarding/products/${encodeURIComponent(productId)}/categories/${encodeURIComponent(categorySlug)}/learn/stream`;

  const authHeaders = await getAuthHeaders();
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Accept': 'text/event-stream',
      ...authHeaders,
    },
  });

  if (!response.ok) {
    throw new ApiClientError('Failed to stream learning content', response.status);
  }

  if (!response.body) {
    throw new ApiClientError('No response body', 500);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6));
          yield { event: data.event || 'chunk', data };
        } catch {
          // Skip invalid JSON
        }
      }
    }
  }
}

/**
 * 제품별 AI 채팅 스트리밍
 */
export async function* streamProductChat(
  productId: string,
  message: string,
  options?: {
    sessionId?: string;
    categorySlug?: string;
  }
): AsyncGenerator<ChatStreamEvent> {
  const params = new URLSearchParams({ message });
  if (options?.sessionId) {
    params.append('sessionId', options.sessionId);
  }
  if (options?.categorySlug) {
    params.append('categorySlug', options.categorySlug);
  }

  const url = `${API_BASE_URL}/onboarding/products/${encodeURIComponent(productId)}/chat/stream?${params.toString()}`;

  const authHeaders = await getAuthHeaders();
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Accept': 'text/event-stream',
      ...authHeaders,
    },
  });

  if (!response.ok) {
    throw new ApiClientError('Failed to stream chat', response.status);
  }

  if (!response.body) {
    throw new ApiClientError('No response body', 500);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6));
          yield { event: data.event || 'chunk', data };
        } catch {
          // Skip invalid JSON
        }
      }
    }
  }
}

// ============================================
// 커리큘럼 API (Curriculum)
// ============================================

import type {
  CurriculumModule,
  QuizQuestion,
  QuizSubmitRequest,
  QuizSubmitResponse,
  ModuleProgress,
  ProgressSummary,
} from '../types';

/**
 * 커리큘럼 모듈 목록 조회 (진도 포함)
 */
export async function getCurriculumModules(
  sessionId: string,
  product: string = 'freshservice'
): Promise<CurriculumModule[]> {
  return apiFetch<CurriculumModule[]>(
    `/curriculum/modules?sessionId=${encodeURIComponent(sessionId)}&product=${encodeURIComponent(product)}`
  );
}

/**
 * 모듈 상세 조회
 */
export async function getCurriculumModule(moduleId: string): Promise<CurriculumModule> {
  return apiFetch<CurriculumModule>(`/curriculum/modules/${encodeURIComponent(moduleId)}`);
}

// ============================================
// 모듈 콘텐츠 조회 (정적 콘텐츠)
// ============================================

/**
 * 모듈 콘텐츠 타입
 */
export interface ModuleContent {
  id: string;
  moduleId: string;
  sectionType: string;  // overview, core_concepts, features, practice, faq
  level: string;  // basic, intermediate, advanced
  titleKo: string;
  titleEn?: string;
  contentMd: string;
  displayOrder: number;
  estimatedMinutes: number;
  isActive: boolean;
}

export interface ModuleContentResponse {
  moduleId: string;
  moduleName: string;
  levels: string[];  // ["basic", "intermediate", "advanced"]
  sections: Record<string, ModuleContent[]>;  // level -> contents
}

/**
 * 모듈의 전체 학습 콘텐츠 조회 (정적 콘텐츠)
 * - LLM 지연 없이 즉시 로드
 */
export async function getModuleContents(
  moduleId: string,
  level?: string
): Promise<ModuleContentResponse> {
  const params = level ? `?level=${encodeURIComponent(level)}` : '';
  return apiFetch<ModuleContentResponse>(
    `/curriculum/modules/${encodeURIComponent(moduleId)}/contents${params}`
  );
}

/**
 * 특정 섹션 콘텐츠 조회
 */
export async function getSectionContent(
  moduleId: string,
  sectionType: string,
  level: string = 'basic'
): Promise<ModuleContent> {
  return apiFetch<ModuleContent>(
    `/curriculum/modules/${encodeURIComponent(moduleId)}/contents/${encodeURIComponent(sectionType)}?level=${encodeURIComponent(level)}`
  );
}

/**
 * 모듈 학습 콘텐츠 스트리밍
 */
export async function* streamModuleLearning(
  moduleId: string,
  sessionId: string
): AsyncGenerator<ChatStreamEvent> {
  const url = `${API_BASE_URL}/curriculum/modules/${encodeURIComponent(moduleId)}/learn/stream?sessionId=${encodeURIComponent(sessionId)}`;

  const authHeaders = await getAuthHeaders();
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Accept': 'text/event-stream',
      ...authHeaders,
    },
  });

  if (!response.ok) {
    throw new ApiClientError('Failed to stream learning content', response.status);
  }

  if (!response.body) {
    throw new ApiClientError('No response body', 500);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    
    // SSE 이벤트는 빈 줄로 구분됨
    const events = buffer.split('\n\n');
    buffer = events.pop() || '';

    for (const eventBlock of events) {
      if (!eventBlock.trim()) continue;
      
      const lines = eventBlock.split('\n');
      let eventType = 'chunk';
      let eventData: Record<string, unknown> = {};
      
      for (const line of lines) {
        if (line.startsWith('event: ')) {
          eventType = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
          try {
            eventData = JSON.parse(line.slice(6));
          } catch {
            // Skip invalid JSON
          }
        }
      }
      
      if (Object.keys(eventData).length > 0) {
        yield { event: eventType, data: eventData };
      }
    }
  }
}

/**
 * 모듈 섹션별 학습 콘텐츠 스트리밍
 */
export async function* streamModuleSection(
  moduleId: string,
  sessionId: string,
  sectionId: string,
  sectionPrompt: string
): AsyncGenerator<ChatStreamEvent> {
  const params = new URLSearchParams({
    sessionId,
    sectionId,
    sectionPrompt,
  });
  const url = `${API_BASE_URL}/curriculum/modules/${encodeURIComponent(moduleId)}/section/stream?${params.toString()}`;

  const authHeaders = await getAuthHeaders();
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Accept': 'text/event-stream',
      ...authHeaders,
    },
  });

  if (!response.ok) {
    throw new ApiClientError('Failed to stream section content', response.status);
  }

  if (!response.body) {
    throw new ApiClientError('No response body', 500);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    
    const events = buffer.split('\n\n');
    buffer = events.pop() || '';

    for (const eventBlock of events) {
      if (!eventBlock.trim()) continue;
      
      const lines = eventBlock.split('\n');
      let eventType = 'chunk';
      let eventData: Record<string, unknown> = {};
      
      for (const line of lines) {
        if (line.startsWith('event: ')) {
          eventType = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
          try {
            eventData = JSON.parse(line.slice(6));
          } catch {
            // Skip invalid JSON
          }
        }
      }
      
      if (Object.keys(eventData).length > 0) {
        yield { event: eventType, data: eventData };
      }
    }
  }
}

/**
 * 모듈 컨텍스트 AI 멘토 채팅 스트리밍
 */
export async function* streamModuleChat(
  moduleId: string,
  sessionId: string,
  query: string
): AsyncGenerator<ChatStreamEvent> {
  const url = `${API_BASE_URL}/curriculum/modules/${encodeURIComponent(moduleId)}/chat/stream?sessionId=${encodeURIComponent(sessionId)}&query=${encodeURIComponent(query)}`;

  const authHeaders = await getAuthHeaders();
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Accept': 'text/event-stream',
      ...authHeaders,
    },
  });

  if (!response.ok) {
    throw new ApiClientError('Failed to stream module chat', response.status);
  }

  if (!response.body) {
    throw new ApiClientError('No response body', 500);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    
    // SSE 이벤트는 빈 줄로 구분됨
    const events = buffer.split('\n\n');
    buffer = events.pop() || '';

    for (const eventBlock of events) {
      if (!eventBlock.trim()) continue;
      
      const lines = eventBlock.split('\n');
      let eventType = 'chunk';
      let eventData: Record<string, unknown> = {};
      
      for (const line of lines) {
        if (line.startsWith('event: ')) {
          eventType = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
          try {
            eventData = JSON.parse(line.slice(6));
          } catch {
            // Skip invalid JSON
          }
        }
      }
      
      if (Object.keys(eventData).length > 0) {
        yield { event: eventType, data: eventData };
      }
    }
  }
}

/**
 * 자가 점검 문제 조회
 */
export async function getQuizQuestions(
  moduleId: string
): Promise<QuizQuestion[]> {
  return apiFetch<QuizQuestion[]>(
    `/curriculum/modules/${encodeURIComponent(moduleId)}/questions`
  );
}

/**
 * 자가 점검 제출 및 채점
 */
export async function submitQuiz(
  moduleId: string,
  request: QuizSubmitRequest
): Promise<QuizSubmitResponse> {
  return apiFetch<QuizSubmitResponse>(
    `/curriculum/modules/${encodeURIComponent(moduleId)}/submit`,
    {
      method: 'POST',
      body: JSON.stringify(request),
    }
  );
}

/**
 * 전체 학습 진도 요약 조회
 */
export async function getProgressSummary(
  sessionId: string,
  product: string = 'freshservice'
): Promise<ProgressSummary> {
  const result = await apiFetch<ProgressSummary>(
    `/curriculum/progress?sessionId=${encodeURIComponent(sessionId)}&product=${encodeURIComponent(product)}`
  );
  
  return result;
}

/**
 * 모듈별 진도 조회
 */
export async function getModuleProgress(
  moduleId: string,
  sessionId: string
): Promise<ModuleProgress> {
  return apiFetch<ModuleProgress>(
    `/curriculum/modules/${encodeURIComponent(moduleId)}/progress?sessionId=${encodeURIComponent(sessionId)}`
  );
}

/**
 * 모듈 진도 업데이트
 */
export async function updateModuleProgress(
  moduleId: string,
  sessionId: string,
  options: { status?: string; learningCompleted?: boolean; force?: boolean }
): Promise<ModuleProgress> {
  return apiFetch<ModuleProgress>(
    `/curriculum/modules/${encodeURIComponent(moduleId)}/progress`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        sessionId,
        status: options.status,
        learningCompleted: options.learningCompleted,
        force: options.force || false,
      }),
    }
  );
}

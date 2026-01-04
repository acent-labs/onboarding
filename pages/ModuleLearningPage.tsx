import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { 
  ArrowLeft, ArrowRight, Bot, Check, CheckCircle, ChevronRight, 
  ClipboardCheck, Clock, HelpCircle, Leaf, Lightbulb, MessageSquare, 
  RotateCcw, Send, Settings, Sprout, Trash2, TreeDeciduous, X,
  Rocket, Briefcase, BookOpen, Quote
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import LoadingSpinner from '../components/LoadingSpinner';
import PageHeader from '@/components/layout/PageHeader';
import ContentWithSidebar from '@/components/layout/ContentWithSidebar';
import TabNav from '@/components/layout/TabNav';
import AIMentorChat from '@/components/chat/AIMentorChat';
import { useAuth } from '../contexts/AuthContext';
import {
  getCurriculumModule,
  getModuleContents,
  streamModuleChat,
  getQuizQuestions,
  submitQuiz,
  updateModuleProgress,
  getModuleProgress,
  ModuleContent,
  ModuleContentResponse,
} from '../services/apiClient';
import { CurriculumModule, QuizQuestion, QuizSubmitResponse, QuizAnswer, ModuleProgress } from '../types';

type Phase = 'learning' | 'quiz' | 'result';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// 레벨별 정보
const LEVELS = [
  { id: 'basic', name: '기초', icon: Sprout, description: '핵심 개념과 기본 사용법' },
  { id: 'intermediate', name: '중급', icon: Leaf, description: 'ITIL 기반 심화 학습' },
  { id: 'advanced', name: '고급', icon: TreeDeciduous, description: '자동화와 API 활용' },
];

// 섹션별 아이콘
const SECTION_ICONS: Record<string, React.ElementType> = {
  overview: Lightbulb,
  'feature-basic': Settings,
  'feature-advanced': Rocket,
  practice: Briefcase,
  quiz: CheckCircle,
};

const ModuleLearningPage: React.FC = () => {
  const navigate = useNavigate();
  const { productId, moduleId } = useParams<{ productId: string; moduleId: string }>();
  const chatEndRef = useRef<HTMLDivElement>(null);
  const { sessionId } = useAuth();

  // Module state
  const [module, setModule] = useState<CurriculumModule | null>(null);
  const [isLoadingModule, setIsLoadingModule] = useState(true);

  // Content state (정적 콘텐츠)
  const [contentData, setContentData] = useState<ModuleContentResponse | null>(null);
  const [isLoadingContent, setIsLoadingContent] = useState(true);
  const [currentLevel, setCurrentLevel] = useState<string>('basic');
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);

  // 레벨별 완료 상태 (자가점검 잠금 해제에 사용)
  const [completedLevels, setCompletedLevels] = useState<Record<string, boolean>>({});

  // Phase (자가 점검)
  const [phase, setPhase] = useState<Phase>('learning');

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);

  // Quiz state
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<QuizSubmitResponse | null>(null);
  const [quizStartTime, setQuizStartTime] = useState<Date | null>(null);

  // 퀴즈 로드 (phase=quiz일 때만)
  // - 서버에서 잘못된 모듈의 문제가 섞여 내려오는 경우(피드백) 클라이언트에서 최소한의 방어 필터링을 적용
  useEffect(() => {
    const loadQuestions = async () => {
      if (!moduleId) return;
      try {
        const data = await getQuizQuestions(moduleId);
        const filtered = data.filter(q => q.moduleId === moduleId);
        if (filtered.length !== data.length) {
          console.warn('[Quiz] Filtered mismatched questions', {
            moduleId,
            received: data.length,
            kept: filtered.length,
          });
        }
        setQuestions(filtered);
        setCurrentQuestionIndex(0);
        setSelectedAnswers({});
        setQuizStartTime(new Date());
      } catch (error) {
        console.error('Failed to load questions:', error);
        setQuestions([]);
      }
    };

    if (phase === 'quiz') {
      loadQuestions();
    }
  }, [moduleId, phase]);

  // Scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // 모듈 정보 로드
  useEffect(() => {
    const loadModule = async () => {
      if (!moduleId) return;
      setIsLoadingModule(true);
      try {
        const data = await getCurriculumModule(moduleId);
        setModule(data);
      } catch (error) {
        console.error('Failed to load module:', error);
      } finally {
        setIsLoadingModule(false);
      }
    };
    loadModule();
  }, [moduleId]);

  // 정적 콘텐츠 로드 (LLM 없이 즉시)
  useEffect(() => {
    const loadContents = async () => {
      if (!moduleId) return;
      setIsLoadingContent(true);
      try {
        const data = await getModuleContents(moduleId);
        setContentData(data);
        // 첫 번째 레벨로 설정
        if (data.levels.length > 0 && !data.levels.includes(currentLevel)) {
          setCurrentLevel(data.levels[0]);
        }
      } catch (error) {
        console.error('Failed to load contents:', error);
      } finally {
        setIsLoadingContent(false);
      }
    };
    loadContents();
  }, [moduleId]);

  // 레벨 변경 시 섹션 인덱스 초기화
  useEffect(() => {
    setCurrentSectionIndex(0);
  }, [currentLevel]);

  // 현재 진행 상태 확인 및 학습 시작 시 진도 업데이트
  const [currentProgress, setCurrentProgress] = useState<ModuleProgress | null>(null);
  const [isRestarting, setIsRestarting] = useState(false);
  
  useEffect(() => {
    const checkAndUpdateProgress = async () => {
      if (!moduleId || !sessionId) return;
      try {
        // 현재 진행 상태 조회
        const progress = await getModuleProgress(moduleId, sessionId);
        setCurrentProgress(progress);
        
        // 이미 완료된 상태가 아닐 때만 'learning'으로 업데이트
        if (progress.status !== 'completed') {
        await updateModuleProgress(moduleId, sessionId, { status: 'learning' });
          // 업데이트 후 상태 갱신
          const updated = await getModuleProgress(moduleId, sessionId);
          setCurrentProgress(updated);
        }
      } catch (error) {
        console.error('Failed to check/update progress:', error);
      }
    };
    checkAndUpdateProgress();
  }, [moduleId, sessionId]);

  // 재시작 핸들러
  const handleRestart = async () => {
    if (!moduleId || !sessionId || !confirm('이 모듈을 처음부터 다시 시작하시겠습니까? 진행 상태가 초기화됩니다.')) {
      return;
    }
    
    setIsRestarting(true);
    try {
      // 진행 상태를 'learning'으로 재설정 (완료 상태 해제, force=true로 덮어쓰기)
      await updateModuleProgress(moduleId, sessionId, { status: 'learning', force: true });
      const updated = await getModuleProgress(moduleId, sessionId);
      setCurrentProgress(updated);
      
      // 학습 상태 초기화
      setPhase('learning');
      setCurrentLevel('basic');
      setCurrentSectionIndex(0);
      setCompletedLevels({});
      setChatMessages([]);
      setResult(null);
    } catch (error) {
      console.error('Failed to restart module:', error);
      alert('재시작에 실패했습니다.');
    } finally {
      setIsRestarting(false);
    }
  };

  // 현재 레벨 마지막 섹션까지 도달하면 해당 레벨 완료로 마킹
  useEffect(() => {
    if (!currentLevel || !contentData) return;
    const currentSections = (contentData.sections[currentLevel] || []).slice().sort((a, b) => a.displayOrder - b.displayOrder);
    if (currentSections.length === 0) return;
    if (currentSectionIndex !== currentSections.length - 1) return;

    setCompletedLevels((prev) => {
      if (prev[currentLevel]) return prev;
      return { ...prev, [currentLevel]: true };
    });
  }, [currentLevel, currentSectionIndex, contentData]);

  // 채팅 메시지 전송
  const handleSendChat = useCallback(async (message: string) => {
    if (!message.trim() || !moduleId || !sessionId || isChatLoading) return;

    const userMessage: ChatMessage = { role: 'user', content: message };
    setChatMessages(prev => [...prev, userMessage]);
    setChatInput('');
    setIsChatLoading(true);

    try {
      const stream = streamModuleChat(moduleId, sessionId, message);
      let response = '';

      setChatMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      for await (const event of stream) {
        if (event.event === 'result' && event.data?.text) {
          response = event.data.text as string;
          setChatMessages(prev => {
            const updated = [...prev];
            updated[updated.length - 1].content = response;
            return updated;
          });
        } else if (event.event === 'chunk' && event.data?.text) {
          response = event.data.text as string;
          setChatMessages(prev => {
            const updated = [...prev];
            updated[updated.length - 1].content = response;
            return updated;
          });
        }
      }
    } catch (error) {
      console.error('Failed to send chat:', error);
      setChatMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1].content = '죄송합니다. 답변을 생성하는 중 오류가 발생했습니다.';
        return updated;
      });
    } finally {
      setIsChatLoading(false);
    }
  }, [moduleId, sessionId, isChatLoading]);

  // 답변 선택
  const handleAnswerSelect = (questionId: string, choiceId: string) => {
    setSelectedAnswers(prev => ({ ...prev, [questionId]: choiceId }));
  };

  // 퀴즈 제출
  const handleSubmitQuiz = async () => {
    if (!moduleId || !sessionId) return;
    setIsSubmitting(true);
    try {
      const answers: QuizAnswer[] = Object.entries(selectedAnswers).map(([questionId, choiceId]) => ({
        questionId,
        choiceId,
      }));
      const response = await submitQuiz(moduleId, {
        sessionId,
        moduleId,
        answers,
        startedAt: quizStartTime?.toISOString()
      });
      setResult(response);

      // 자가 점검 완료를 모듈 진도에 반영 (커리큘럼 진행률/완료 배지 업데이트)
      try {
        await updateModuleProgress(moduleId, sessionId, {
          status: 'completed',
          learningCompleted: true,
        });
      } catch (e) {
        console.warn('Failed to update module completion status:', e);
      }

      setPhase('result');
    } catch (error) {
      console.error('Failed to submit quiz:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // 모듈 목록으로 돌아가기 (목록 페이지에서 즉시 새로고침 트리거)
  const handleGoBack = () => {
    navigate(`/curriculum/${productId}`, { state: { refresh: Date.now() } });
  };

  // 로딩 중
  if (isLoadingModule) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (!module) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center space-y-6">
            <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mx-auto">
              <HelpCircle className="w-8 h-8 text-destructive" />
            </div>
            <p className="text-muted-foreground">모듈을 찾을 수 없습니다.</p>
            <Button onClick={handleGoBack} variant="outline">
              <ArrowLeft className="w-4 h-4 mr-2" />목록으로 돌아가기
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 현재 레벨의 섹션들 (백엔드에서 내려준 sectionType을 그대로 사용)
  const currentSections = (contentData?.sections[currentLevel] || []).slice().sort((a, b) => a.displayOrder - b.displayOrder);
  const availableLevels = contentData?.levels || ['basic'];
  const activeSection = currentSections[currentSectionIndex];

  // 레벨 순서(기초->중급->고급)로 정렬
  const orderedLevels = availableLevels
    .slice()
    .sort((a, b) => {
      const order = ['basic', 'intermediate', 'advanced'];
      return order.indexOf(a) - order.indexOf(b);
    });

  const levelsWithContent = orderedLevels.filter((lvl) => (contentData?.sections[lvl]?.length || 0) > 0);
  const isQuizUnlocked = levelsWithContent.every((lvl) => completedLevels[lvl]);

  const nextIncompleteLevel = levelsWithContent.find((lvl) => !completedLevels[lvl]);
  const nextLevelInOrder = (() => {
    const idx = orderedLevels.indexOf(currentLevel);
    if (idx < 0) return undefined;
    return orderedLevels[idx + 1];
  })();

  // 퀴즈 결과 화면 - Modern Deep Glass Style
  if (phase === 'result' && result) {
    return (
      <div className="min-h-screen pb-12 -mt-2">
        {/* 히어로 헤더 */}
        <div className="relative overflow-hidden mb-8 rounded-3xl shadow-xl bg-card border border-border">
          <div className="absolute inset-0 bg-primary/10 z-0"></div>
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-emerald-500/20 rounded-full blur-[100px] opacity-30 z-10 pointer-events-none"></div>

          <div className="relative z-20 px-6 py-10 max-w-4xl mx-auto text-center">
            <h1 className="text-3xl font-display font-bold text-foreground mb-2">자가 점검 결과</h1>
            <p className="text-muted-foreground mb-8">{module.nameKo}</p>

            <div className="inline-block relative">
              <div className="absolute inset-0 bg-emerald-500 blur-2xl opacity-20 rounded-full"></div>
              <div className="relative bg-card rounded-3xl p-8 border border-border min-w-[300px]">
                <div className="text-7xl font-bold bg-clip-text text-transparent bg-gradient-to-br from-foreground to-muted-foreground mb-2">
                  {result.score}
                  <span className="text-2xl text-muted-foreground ml-1">점</span>
                </div>
                <div className="flex items-center justify-center gap-2 text-emerald-500 font-medium bg-emerald-500/10 py-1 px-3 rounded-full mx-auto w-fit border border-emerald-500/20">
                  <CheckCircle className="w-4 h-4" />
                  <span>{result.correctCount}개 정답 / {result.totalQuestions}문항</span>
                </div>
              </div>
            </div>

            <div className="mt-8 flex justify-center gap-4">
              <Button
                onClick={handleGoBack}
                variant="outline"
                size="lg"
                className="bg-background/50 hover:bg-background/80 text-foreground border-border backdrop-blur-md"
              >
                <ArrowLeft className="w-4 h-4 mr-2" /> 목록으로
              </Button>
              <Button
                onClick={() => {
                  setPhase('learning');
                  setCurrentQuestionIndex(0);
                  setSelectedAnswers({});
                  setResult(null);
                }}
                size="lg"
                className="bg-card text-foreground hover:bg-card/90 border border-border"
              >
                <RotateCcw className="w-4 h-4 mr-2" /> 다시 학습하기
              </Button>
            </div>
          </div>
        </div>

        {/* 결과 상세 리스트 */}
        <div className="max-w-3xl mx-auto px-4 space-y-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent"></div>
            <span className="text-muted-foreground font-bold text-sm uppercase tracking-wider">상세 분석</span>
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent"></div>
          </div>

          {result.answers.map((r, idx) => {
            const question = questions.find(q => q.id === r.questionId);
            if (!question) return null;

            const isCorrect = r.isCorrect;

            return (
              <div key={r.questionId} className={`bg-card rounded-2xl overflow-hidden transition-all duration-300 border 
                ${isCorrect ? 'border-emerald-500/20 hover:shadow-emerald-500/10' : 'border-rose-500/20 hover:shadow-rose-500/10'} hover:shadow-xl`}>
                <div className={`px-6 py-4 flex items-center justify-between ${isCorrect ? 'bg-emerald-500/10' : 'bg-rose-500/10'}`}>
                  <div className="flex items-center gap-3">
                    <span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shadow-sm
                      ${isCorrect ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'}`}>
                      Q{idx + 1}
                    </span>
                    <span className={`font-bold text-sm uppercase tracking-wide ${isCorrect ? 'text-emerald-500' : 'text-rose-500'}`}>
                      {isCorrect ? '정답입니다' : '오답입니다'}
                    </span>
                  </div>
                  {isCorrect ? (
                    <Check className="w-5 h-5 text-emerald-500" />
                  ) : (
                    <X className="w-5 h-5 text-rose-500" />
                  )}
                </div>

                <div className="p-6">
                  <h3 className="text-lg font-bold text-foreground mb-4">{question.question}</h3>

                  <div className="space-y-3 mb-4">
                    <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-xl border border-border">
                      <span className="text-xs font-bold text-muted-foreground mt-1 min-w-[40px]">내 답안</span>
                      <span className={`font-medium ${isCorrect ? 'text-foreground' : 'text-rose-500 line-through'}`}>
                        {question.choices.find(c => c.id === r.choiceId)?.text}
                      </span>
                    </div>

                    {!isCorrect && (
                      <div className="flex items-start gap-3 p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
                        <span className="text-xs font-bold text-emerald-500 mt-1 min-w-[40px]">정답</span>
                        <span className="font-bold text-emerald-600">
                          {question.choices.find(c => c.id === r.correctChoiceId)?.text}
                        </span>
                      </div>
                    )}
                  </div>

                  {r.explanation && (
                    <div className="bg-muted/50 rounded-xl p-4 text-sm text-muted-foreground border border-border flex items-start gap-3">
                      <Lightbulb className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <span className="font-bold text-foreground block mb-1">해설</span>
                        {r.explanation}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // 퀴즈 화면 - Modern Deep Glass Style
  if (phase === 'quiz') {
    const currentQuestion = questions[currentQuestionIndex];
    const allAnswered = questions.length > 0 && Object.keys(selectedAnswers).length === questions.length;
    const progressPercent = questions.length > 0 ? ((currentQuestionIndex + 1) / questions.length) * 100 : 0;

    return (
      <div className="min-h-screen pb-12 -mt-2">
        {/* 축소된 헤더 */}
        <div className="relative overflow-hidden mb-6 rounded-3xl shadow-lg bg-card border border-border">
          <div className="absolute inset-0 bg-primary/10 z-0"></div>

          <div className="relative z-20 px-6 py-6 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setPhase('learning')}
                className="w-10 h-10 rounded-full bg-background/50 hover:bg-background/80 flex items-center justify-center text-foreground transition backdrop-blur-md"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-xl font-bold text-foreground">자가 점검</h1>
                <p className="text-muted-foreground text-sm">{module?.nameKo}</p>
              </div>
            </div>

            <div className="flex flex-col items-end">
              <span className="text-foreground font-bold text-lg mb-1">
                <span className="text-primary">{questions.length > 0 ? currentQuestionIndex + 1 : 0}</span>
                <span className="text-muted-foreground mx-1">/</span>
                {questions.length}
              </span>
              <div className="w-32 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                ></div>
              </div>
            </div>
          </div>
        </div>

        {/* 퀴즈 컨텐츠 */}
        <div className="max-w-3xl mx-auto px-4">
          {currentQuestion ? (
            <div className="bg-card rounded-3xl p-8 border border-border shadow-xl relative overflow-hidden animate-fade-in">
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/20 rounded-full blur-2xl -mr-10 -mt-10 opacity-60"></div>

              <div className="relative z-10">
                <div className="inline-block px-3 py-1 bg-muted text-muted-foreground rounded-lg text-xs font-bold uppercase tracking-wider mb-4 border border-border">
                  Question {currentQuestionIndex + 1}
                </div>

                <h2 className="text-2xl font-display font-bold text-foreground mb-6 leading-snug">
                  {currentQuestion.question}
                </h2>

                {currentQuestion.context && (
                  <div className="bg-muted/50 p-4 rounded-xl border border-border text-muted-foreground text-sm mb-8 italic flex items-start gap-3">
                    <Quote className="w-5 h-5 text-muted-foreground/50 flex-shrink-0" />
                    {currentQuestion.context}
                  </div>
                )}

                <div className="space-y-3">
                  {currentQuestion.choices.map((choice) => {
                    const isSelected = selectedAnswers[currentQuestion.id] === choice.id;
                    return (
                      <button
                        key={choice.id}
                        onClick={() => handleAnswerSelect(currentQuestion.id, choice.id)}
                        className={`w-full text-left p-4 rounded-xl border-2 transition-all duration-200 flex items-center gap-4 group
                          ${isSelected
                            ? 'border-primary bg-primary/10 text-primary shadow-md ring-1 ring-primary/20'
                            : 'border-border bg-card hover:border-primary/50 hover:bg-muted/50 text-foreground'
                          }`}
                      >
                        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors
                          ${isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-border group-hover:border-primary/50'}`}>
                          {isSelected && <Check className="w-3 h-3" />}
                        </div>
                        <span className="font-medium">{choice.text}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 하단 네비게이션 */}
              <div className="mt-10 pt-6 border-t border-border flex justify-between items-center">
                <Button
                  onClick={() => setCurrentQuestionIndex(prev => Math.max(0, prev - 1))}
                  disabled={currentQuestionIndex === 0}
                  variant="ghost"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />이전 문제
                </Button>

                {currentQuestionIndex < questions.length - 1 ? (
                  <Button
                    onClick={() => setCurrentQuestionIndex(prev => prev + 1)}
                    size="lg"
                    disabled={!selectedAnswers[currentQuestion.id]}
                  >
                    다음 문제 <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                ) : (
                  <Button
                    onClick={handleSubmitQuiz}
                    disabled={!allAnswered || isSubmitting}
                    size="lg"
                    className="bg-gradient-to-r from-primary to-indigo-600 hover:from-primary/90 hover:to-indigo-500"
                  >
                    {isSubmitting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></div>
                        <span>채점 중...</span>
                      </>
                    ) : (
                      <>
                        <ClipboardCheck className="w-4 h-4 mr-2" />
                        <span>제출하기</span>
                      </>
                    )}
                  </Button>
                )}
              </div>

            </div>
          ) : (
            <div className="bg-card rounded-3xl p-12 text-center border border-border">
              <div className="relative w-20 h-20 mx-auto mb-6">
                <div className="absolute inset-0 border-4 border-muted rounded-full"></div>
                <div className="absolute inset-0 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center text-primary">
                  <HelpCircle className="w-8 h-8" />
                </div>
              </div>
              <h3 className="text-xl font-bold text-foreground mb-2">문제를 준비하고 있습니다</h3>
              <p className="text-muted-foreground">AI가 학습 내용을 바탕으로 문제를 생성 중입니다...</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // 이모지 제거 유틸리티
  const stripEmoji = (text: string): string => {
    return text.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}]/gu, '').trim();
  };

  // 학습 화면 (정적 콘텐츠) - Modern Deep Glass Style
  return (
    <ContentWithSidebar
      sidebar={
        <AIMentorChat
          messages={chatMessages}
          onSendMessage={handleSendChat}
          isLoading={isChatLoading}
          onClearMessages={() => setChatMessages([])}
          mentorName="고복수 팀장"
        />
      }
      sidebarWidth="lg"
      collapsible={false}
      className="h-[calc(100vh-10rem)]"
    >
      <div className="flex-1 flex flex-col h-full min-w-0">
          {/* 컴팩트 히어로 헤더 - 높이 고정 및 정렬 */}
          <div className="bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 py-3 border-b border-border flex flex-col justify-center flex-shrink-0">
            <div className="w-full">
              <div className="flex items-center justify-between mb-2">
                <button
                  onClick={handleGoBack}
                  className="flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>목록으로</span>
                </button>
                
                {/* 레벨 & 자가점검 탭 */}
                <div className="flex gap-1 bg-muted/50 p-1 rounded-lg">
                  {availableLevels.map((level) => {
                    const levelInfo = LEVELS.find(l => l.id === level) || { name: level, icon: Sprout };
                    const LevelIcon = levelInfo.icon;
                    const isActive = currentLevel === level;
                    return (
                      <button
                        key={level}
                        onClick={() => {
                          setCurrentLevel(level);
                        }}
                        className={`px-3 py-1 rounded-md text-xs font-medium transition-all duration-200 flex items-center gap-1.5 ${
                          isActive 
                            ? 'bg-background text-foreground shadow-sm' 
                            : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                        }`}
                      >
                        <LevelIcon className="w-3 h-3" />
                        {levelInfo.name}
                      </button>
                    );
                  })}
                  <div className="w-px bg-border mx-1 my-1"></div>
                  <button
                    onClick={() => {
                      if (isQuizUnlocked) {
                        setPhase('quiz');
                        return;
                      }

                      // 아직 모든 레벨 학습을 끝내지 않았다면, 미완료 레벨로 안내
                      if (nextIncompleteLevel) {
                        setCurrentLevel(nextIncompleteLevel);
                        setCurrentSectionIndex(0);
                      }
                    }}
                    disabled={!isQuizUnlocked}
                    title={!isQuizUnlocked ? '기초/중급/고급 학습을 모두 완료하면 자가 점검이 열립니다.' : '자가 점검 시작'}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-all duration-200 flex items-center gap-1.5 \
                      ${isQuizUnlocked
                        ? 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                        : 'text-muted-foreground/50 cursor-not-allowed'
                      }`}
                  >
                    <ClipboardCheck className="w-3 h-3" />
                    자가 점검
                  </button>
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h1 className="text-xl font-bold text-foreground truncate">{module.nameKo}</h1>
                    {currentProgress?.status === 'completed' && (
                      <Badge className="bg-green-500/20 text-green-600 hover:bg-green-500/20 border border-green-500/30">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        완료
                      </Badge>
                    )}
                  </div>
                  <p className="text-muted-foreground text-xs truncate">{module.description}</p>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground ml-6 flex-shrink-0">
                  {currentProgress?.status === 'completed' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleRestart}
                      disabled={isRestarting}
                      className="text-xs"
                    >
                      <RotateCcw className="w-3 h-3 mr-1" />
                      {isRestarting ? '재시작 중...' : '재시작'}
                    </Button>
                  )}
                  <span className="flex items-center gap-1 bg-muted/30 px-2 py-1 rounded">
                    <Clock className="w-3 h-3 text-primary/70" />
                    약 {module.estimatedMinutes}분
                  </span>
                  <span className="flex items-center gap-1 bg-muted/30 px-2 py-1 rounded">
                    <BookOpen className="w-3 h-3 text-primary/70" />
                    핵심 개념
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 스크롤 가능한 콘텐츠 영역 */}
          <div className="flex-1 overflow-hidden p-0 min-h-0 bg-background">
            <div className="h-full flex flex-col">
            {isLoadingContent ? (
              <Card className="p-12 text-center shadow-none border-0 rounded-none">
                <LoadingSpinner />
                <p className="mt-4 text-muted-foreground font-medium">콘텐츠를 불러오는 중...</p>
              </Card>
            ) : currentSections.length === 0 ? (
              <Card className="p-12 text-center shadow-none border-0 rounded-none">
                <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mx-auto mb-6">
                  <BookOpen className="w-10 h-10 text-muted-foreground/50" />
                </div>
                <p className="text-foreground font-bold text-lg mb-2">이 레벨에는 아직 콘텐츠가 없습니다.</p>
                <p className="text-sm text-muted-foreground">다른 레벨을 선택하거나 AI 멘토에게 질문해보세요.</p>
              </Card>
            ) : (
              <>
                {/* 섹션 진행 상태 표시 */}
                <div className="mb-6 px-4 flex items-center justify-between">
                  <div className="text-sm font-medium text-muted-foreground">
                    Step {currentSectionIndex + 1} of {currentSections.length}
                  </div>
                  <div className="w-48 h-2 bg-muted rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-primary transition-all duration-300"
                      style={{ width: `${((currentSectionIndex + 1) / currentSections.length) * 100}%` }}
                    ></div>
                  </div>
                </div>

                {/* 활성 섹션 카드 (단일 뷰) - 고정 높이로 일관성 유지 */}
                {activeSection && (
                  <Card className="flex-1 flex flex-col overflow-hidden shadow-none border-0 rounded-none bg-card min-h-[500px]">
                    {/* 섹션 헤더 - 간결하게 */}
                    <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center gap-3 flex-shrink-0">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                        {(() => {
                          const Icon = SECTION_ICONS[activeSection.sectionType] || BookOpen;
                          return <Icon className="w-5 h-5" />;
                        })()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-lg text-foreground truncate">
                          {stripEmoji(activeSection.titleKo)}
                        </h3>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          약 {activeSection.estimatedMinutes}분
                        </p>
                      </div>
                    </div>

                    {/* 섹션 내용 - 스크롤 가능, 고정 영역 */}
                    <div className="flex-1 overflow-y-auto px-4 py-4 bg-card">
                      <article className="prose prose-sm sm:prose-base max-w-none
                        dark:prose-invert
                        prose-headings:font-semibold prose-headings:text-foreground prose-headings:mt-6 prose-headings:mb-3
                        prose-h2:text-xl prose-h2:border-b prose-h2:border-border prose-h2:pb-2
                        prose-h3:text-lg prose-h3:text-foreground
                        prose-h4:text-base prose-h4:text-foreground
                        prose-p:text-foreground/80 prose-p:leading-relaxed prose-p:my-3
                        prose-strong:text-foreground prose-strong:font-semibold
                        prose-a:text-primary prose-a:no-underline hover:prose-a:underline
                        prose-ul:my-3 prose-ul:pl-4 prose-ol:my-3 prose-ol:pl-4
                        prose-li:text-foreground/80 prose-li:my-1
                        prose-code:text-primary prose-code:bg-primary/10 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:font-mono prose-code:text-sm prose-code:before:content-none prose-code:after:content-none
                        prose-pre:bg-muted prose-pre:border prose-pre:border-border prose-pre:rounded-lg prose-pre:my-4
                        prose-blockquote:border-l-4 prose-blockquote:border-primary/50 prose-blockquote:bg-muted/50 prose-blockquote:py-1 prose-blockquote:px-4 prose-blockquote:rounded-r prose-blockquote:not-italic prose-blockquote:text-foreground/70
                        prose-table:border prose-table:border-border prose-th:bg-muted prose-th:px-3 prose-th:py-2 prose-td:px-3 prose-td:py-2 prose-td:border prose-td:border-border
                        prose-img:rounded-lg prose-img:shadow-sm prose-img:my-4
                        prose-hr:border-border prose-hr:my-6
                      ">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {stripEmoji(activeSection.contentMd)}
                        </ReactMarkdown>
                      </article>
                    </div>

                    {/* 네비게이션 버튼 */}
                    <div className="p-4 border-t border-border bg-background flex justify-between items-start flex-shrink-0 h-[103px]">
                      <Button
                        variant="outline"
                        onClick={() => setCurrentSectionIndex(prev => Math.max(0, prev - 1))}
                        disabled={currentSectionIndex === 0}
                        className="gap-2 h-[46px]"
                      >
                        <ArrowLeft className="w-4 h-4" /> 이전
                      </Button>

                      {currentSectionIndex < currentSections.length - 1 ? (
                        <Button
                          onClick={() => setCurrentSectionIndex(prev => prev + 1)}
                          className="gap-2 h-[46px]"
                        >
                          다음 <ArrowRight className="w-4 h-4" />
                        </Button>
                      ) : (
                        <Button
                          onClick={() => {
                            // 1) 아직 모든 레벨을 끝내지 않았다면: 다음 레벨(또는 미완료 레벨)로 이동
                            if (!isQuizUnlocked) {
                              const target = nextLevelInOrder || nextIncompleteLevel;
                              if (target) {
                                setCurrentLevel(target);
                                setCurrentSectionIndex(0);
                              }
                              return;
                            }

                            // 2) 모든 레벨 완료: 자가 점검 시작
                            setPhase('quiz');
                          }}
                          className={`gap-2 h-[46px] ${isQuizUnlocked
                            ? 'bg-gradient-to-r from-primary to-indigo-600 hover:from-primary/90 hover:to-indigo-500'
                            : 'bg-muted text-muted-foreground hover:bg-muted'
                          }`}
                        >
                          {isQuizUnlocked
                            ? (
                              <>자가 점검 시작 <ClipboardCheck className="w-4 h-4" /></>
                            )
                            : (
                              <>다음 학습으로 <ArrowRight className="w-4 h-4" /></>
                            )
                          }
                        </Button>
                      )}
                    </div>
                  </Card>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </ContentWithSidebar>
  );
};

export default ModuleLearningPage;

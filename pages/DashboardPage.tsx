import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';
import { getProducts, getProgressSummary } from '../services/apiClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import SectionHeader from '../components/layout/SectionHeader';
import type { CurriculumModule } from '../types';

interface RecentActivity {
  moduleId: string;
  moduleName: string;
  completedAt: string;
  productName?: string;
  productId?: string;
}

interface DashboardProgress {
  totalModules: number;
  completedModules: number;
  completionPercent: number;
  recentActivities: RecentActivity[];
  continueProductId?: string;
}

const DashboardPage: React.FC = () => {
  const { user, sessionId, isSessionReady } = useAuth();
  const [progress, setProgress] = useState<DashboardProgress | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const userName = user?.name || user?.email?.split('@')[0] || '신입사원';

  useEffect(() => {
    const loadProgress = async () => {
      if (!isSessionReady) {
        setIsLoading(true);
        return;
      }

      if (!sessionId) {
        setError('세션 정보를 찾을 수 없습니다. 다시 로그인해주세요.');
        setProgress(null);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);

      try {
        setError(null);

        const products = await getProducts();

        // 백엔드가 제품 목록을 DB에서 못 읽고 fallback이 비어있는 경우를 대비해 최소 1개 제품으로 진행률 계산
        if (!products || products.length === 0) {
          const summary = await getProgressSummary(sessionId);
          const totalModules = summary.totalModules ?? summary.modules?.length ?? 0;
          const completedModules = summary.completedModules ?? 0;
          const completionPercent =
            totalModules > 0 ? Math.round((completedModules / totalModules) * 100) : 0;

          const recentActivities: RecentActivity[] = (summary.modules || [])
            .filter(m => m.status === 'completed' && Boolean(m.completedAt))
            .sort((a, b) => {
              const aTime = a.completedAt ? new Date(a.completedAt).getTime() : 0;
              const bTime = b.completedAt ? new Date(b.completedAt).getTime() : 0;
              return bTime - aTime;
            })
            .slice(0, 3)
            .map(m => ({
              moduleId: m.id,
              moduleName: m.nameKo,
              completedAt: m.completedAt as string,
              productId: m.targetProductId,
              productName: m.targetProductName,
            }));

          setProgress({
            totalModules,
            completedModules,
            completionPercent,
            recentActivities,
            continueProductId: summary.modules?.find(m => m.status === 'learning')?.targetProductId,
          });
          return;
        }

        const summaries = await Promise.allSettled(
          products.map(p => getProgressSummary(sessionId, p.id))
        );

        const fulfilled = summaries
          .filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof getProgressSummary>>> => r.status === 'fulfilled')
          .map(r => r.value);

        if (fulfilled.length === 0) {
          throw new Error('No progress summaries returned');
        }

        const allModules: CurriculumModule[] = fulfilled.flatMap(s => s.modules || []);
        const totalModules = fulfilled.reduce((acc, s) => acc + (s.totalModules ?? s.modules?.length ?? 0), 0);
        const completedModules = fulfilled.reduce((acc, s) => acc + (s.completedModules ?? 0), 0);
        const inProgressModules = fulfilled.reduce((acc, s) => acc + (s.inProgressModules ?? 0), 0);
        // 진행률 계산: 완료된 모듈은 100%, 진행 중인 모듈은 50%로 반영
        const progressPoints = (completedModules * 100) + (inProgressModules * 50);
        const completionPercent =
          totalModules > 0 ? Math.round(progressPoints / totalModules) : 0;

        const productNameById = new Map(products.map(p => [p.id, p.name]));

        const recentActivities: RecentActivity[] = allModules
          .filter(m => m.status === 'completed' && Boolean(m.completedAt))
          .sort((a, b) => {
            const aTime = a.completedAt ? new Date(a.completedAt).getTime() : 0;
            const bTime = b.completedAt ? new Date(b.completedAt).getTime() : 0;
            return bTime - aTime;
          })
          .slice(0, 3)
          .map(m => ({
            moduleId: m.id,
            moduleName: m.nameKo,
            completedAt: m.completedAt as string,
            productId: m.targetProductId,
            productName: m.targetProductName || productNameById.get(m.targetProductId),
          }));

        const continueProductId =
          recentActivities[0]?.productId ||
          fulfilled.find(s => (s.inProgressModules || 0) > 0)?.modules?.find(m => m.status === 'learning')?.targetProductId ||
          products[0]?.id;

        setProgress({
          totalModules,
          completedModules,
          completionPercent,
          recentActivities,
          continueProductId,
        });
      } catch (error) {
        console.error('Failed to load progress:', error);
        setError('진행 상황을 불러오지 못했습니다.');
        setProgress(null);
      } finally {
        setIsLoading(false);
      }
    };

    loadProgress();
  }, [isSessionReady, sessionId]);

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center space-y-6">
            <i className="fas fa-exclamation-circle text-6xl text-destructive"></i>
            <div>
              <h3 className="text-xl font-bold text-foreground mb-2">오류 발생</h3>
              <p className="text-muted-foreground">{error}</p>
            </div>
            <Button onClick={() => window.location.reload()} className="w-full">
              다시 시도
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const completedCount = progress?.completedModules || 0;
  const totalCount = progress?.totalModules || 0;
  const completionPercent = progress?.completionPercent || 0;
  const recentActivities = progress?.recentActivities || [];

  const quickLinks = [
    {
      title: 'AI 멘토 질문',
      description: '업무 중 막히는 부분은 실시간으로 멘토에게!',
      emoji: '💬',
      to: '/knowledge',
      iconBg: 'bg-violet-100 text-violet-600',
    },
    {
      title: '인수인계 문서',
      description: '팀 지식 저장소에서 필요한 자료를 찾아보세요.',
      emoji: '📂',
      to: '/documents',
      iconBg: 'bg-blue-100 text-blue-600',
    },
    {
      title: '커리큘럼 실습',
      description: '시나리오 기반 학습으로 현업 감각을 익혀요.',
      emoji: '📚',
      to: '/curriculum',
      iconBg: 'bg-amber-100 text-amber-600',
    },
    {
      title: '제품 지식 평가',
      description: 'Freshservice AI 멘토와 실습을 진행해보세요.',
      emoji: '🚀',
      to: '/assessment/products',
      iconBg: 'bg-emerald-100 text-emerald-600',
    },
  ];

  const renderHero = () => (
    <Card className="relative overflow-hidden h-full flex flex-col justify-between bg-primary text-primary-foreground border-0">
      <CardContent className="pt-6 space-y-6">
        <div className="relative z-10 space-y-4">
          <p className="text-sm uppercase tracking-widest text-primary-foreground/70">Onboarding Journey</p>
          <h2 className="text-3xl lg:text-4xl font-bold text-primary-foreground">
            반가워요, {userName}님! 👋
          </h2>
          <p className="text-primary-foreground/80 max-w-2xl text-lg">
            오늘도 성장 여정을 이어가 볼까요? 현재 전체 커리큘럼의{' '}
            <Badge variant="secondary" className="px-2 py-1 text-sm">{completionPercent}%</Badge>
            를 달성했어요.
          </p>
        </div>

        <div className="relative z-10 space-y-3">
          <Progress value={completionPercent} className="h-3 bg-primary-foreground/20" />
          <div className="flex items-center justify-between text-sm text-primary-foreground/80">
            <span>시작 단계</span>
            <span>마스터</span>
          </div>
          {completionPercent < 100 && (
            <Link
              to={progress?.continueProductId ? `/curriculum/${progress.continueProductId}` : '/curriculum'}
              className="inline-flex items-center gap-2 text-sm font-medium text-primary-foreground/90 hover:text-primary-foreground transition"
            >
              학습 이어하기
              <i className="fas fa-arrow-right"></i>
            </Link>
          )}
        </div>
      </CardContent>

      <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.4),_transparent_70%)]" />
    </Card>
  );

  return (
    <div className="layout-stack">
      <SectionHeader
        title="대시보드"
        subtitle="온보딩 진행 상황과 최근 활동을 한눈에 확인하세요"
        icon={<i className="fas fa-compass"></i>}
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 min-h-[18rem]">
          {renderHero()}
        </div>

        <Card className="lg:col-span-1">
          <CardContent className="pt-6 flex flex-col gap-6 h-full justify-center">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">완료한 모듈</p>
                <p className="text-4xl font-bold text-foreground mt-1">
                  {completedCount}
                  <span className="text-lg text-muted-foreground ml-1">/ {totalCount}</span>
                </p>
              </div>
              <span className="w-12 h-12 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center">
                <i className="fas fa-fire"></i>
              </span>
            </div>
            <div className="bg-muted rounded-lg p-4 border border-border">
              <p className="text-sm text-muted-foreground">진행률</p>
              <p className="text-2xl font-semibold text-foreground">{completionPercent}%</p>
            </div>
            <Button asChild className="w-full mt-auto">
              <Link to="/curriculum">
                학습 이어하기
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {quickLinks.map(link => (
          <Card key={link.title} className="hover:-translate-y-1 transition-transform card-hover h-full border-border/50 shadow-sm hover:shadow-md">
            <CardContent className="p-7 h-full flex flex-col">
              <Link to={link.to} className="flex flex-col h-full">
                <div className="flex items-center gap-4 mb-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0 shadow-sm ${link.iconBg}`}>
                    {link.emoji}
                  </div>
                  <p className="text-lg font-bold text-foreground leading-none whitespace-nowrap">{link.title}</p>
                </div>
                <p className="text-sm text-muted-foreground mb-6 flex-1 leading-relaxed break-keep">
                  {link.description}
                </p>
                <div className="mt-auto pt-2">
                  <span className="text-sm font-semibold text-primary inline-flex items-center gap-2 group">
                    바로가기 
                    <i className="fas fa-arrow-right text-xs transition-transform group-hover:translate-x-1"></i>
                  </span>
                </div>
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <i className="fas fa-history text-muted-foreground"></i>
            최근 활동
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {recentActivities.length > 0 ? (
            recentActivities.map((activity, idx) => (
              <div
                key={`${activity.moduleId}-${idx}`}
                className="flex items-center gap-4 p-4 rounded-lg border border-border hover:border-primary/20 transition"
              >
                <div className="w-12 h-12 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <i className="fas fa-check"></i>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground truncate">
                    {activity.moduleName || '알 수 없는 모듈'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {activity.completedAt ? new Date(activity.completedAt).toLocaleDateString() : '날짜 정보 없음'} 완료
                  </p>
                </div>
                <Badge variant="secondary">
                  {activity.productName || '커리큘럼'}
                </Badge>
              </div>
            ))
          ) : (
            <div className="text-center py-10 text-muted-foreground">
              <p>아직 활동 내역이 없습니다. 첫 학습을 시작해보세요!</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default DashboardPage;

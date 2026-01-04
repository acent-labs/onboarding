import React, { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import LoadingSpinner from '../LoadingSpinner';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

type ContentType = 'scenario' | 'quiz' | 'feedback';

interface GeneratedContent {
  id: string;
  type: ContentType;
  title: string;
  content: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

const AIContentGenerator: React.FC = () => {
  const [contentType, setContentType] = useState<ContentType>('scenario');
  const [prompt, setPrompt] = useState('');
  const [context, setContext] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedContents, setGeneratedContents] = useState<GeneratedContent[]>([]);
  const [error, setError] = useState<string | null>(null);

  const getAuthHeaders = () => {
    const token = localStorage.getItem('auth_token') || '';
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    };
  };

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) {
      setError('프롬프트를 입력해주세요.');
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/api/admin/generate-content`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          type: contentType,
          prompt: prompt.trim(),
          context: context.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || '콘텐츠 생성에 실패했습니다.');
      }

      const data = await response.json();
      
      const newContent: GeneratedContent = {
        id: `gen-${Date.now()}`,
        type: contentType,
        title: data.title || `생성된 ${getContentTypeName(contentType)}`,
        content: data.content || JSON.stringify(data, null, 2),
        metadata: data.metadata,
        createdAt: new Date().toISOString(),
      };

      setGeneratedContents(prev => [newContent, ...prev]);
      setPrompt('');
    } catch (e) {
      setError(e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.');
    } finally {
      setIsGenerating(false);
    }
  }, [contentType, prompt, context]);

  const handleCopyContent = (content: string) => {
    navigator.clipboard.writeText(content);
  };

  const handleDeleteContent = (id: string) => {
    setGeneratedContents(prev => prev.filter(c => c.id !== id));
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    setGeneratedContents(prev => {
      const newContents = [...prev];
      [newContents[index - 1], newContents[index]] = [newContents[index], newContents[index - 1]];
      return newContents;
    });
  };

  const handleMoveDown = (index: number) => {
    if (index === generatedContents.length - 1) return;
    setGeneratedContents(prev => {
      const newContents = [...prev];
      [newContents[index], newContents[index + 1]] = [newContents[index + 1], newContents[index]];
      return newContents;
    });
  };

  const getContentTypeName = (type: ContentType) => {
    switch (type) {
      case 'scenario': return '시나리오';
      case 'quiz': return '퀴즈';
      case 'feedback': return '피드백';
      default: return '콘텐츠';
    }
  };

  const getContentTypeIcon = (type: ContentType) => {
    switch (type) {
      case 'scenario': return 'fas fa-theater-masks';
      case 'quiz': return 'fas fa-question-circle';
      case 'feedback': return 'fas fa-comment-dots';
      default: return 'fas fa-file-alt';
    }
  };

  const getPlaceholderPrompt = () => {
    switch (contentType) {
      case 'scenario':
        return '예: 고객 불만 처리 상황에서 적절한 대응 방법을 선택하는 시나리오를 만들어주세요.';
      case 'quiz':
        return '예: Freshservice 티켓 관리 기능에 대한 5문항 퀴즈를 만들어주세요.';
      case 'feedback':
        return '예: 사용자가 선택한 응대 방식에 대한 건설적인 피드백을 생성해주세요.';
      default:
        return '생성할 콘텐츠에 대해 설명해주세요.';
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>AI 콘텐츠 생성기</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>콘텐츠 유형</Label>
            <div className="flex gap-2">
              {(['scenario', 'quiz', 'feedback'] as ContentType[]).map((type) => (
                <Button
                  key={type}
                  variant={contentType === type ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setContentType(type)}
                >
                  <i className={`${getContentTypeIcon(type)} mr-2`} />
                  {getContentTypeName(type)}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ai-prompt">프롬프트</Label>
            <Textarea
              id="ai-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={getPlaceholderPrompt()}
              rows={4}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ai-context">추가 컨텍스트 (선택)</Label>
            <Textarea
              id="ai-context"
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="관련 제품 정보, 대상 사용자, 학습 목표 등 추가 정보를 입력하세요."
              rows={2}
            />
          </div>

          {error && (
            <div className="p-3 rounded-md border border-destructive/40 bg-destructive/10 text-sm text-destructive">
              {error}
            </div>
          )}

          <Button
            onClick={handleGenerate}
            disabled={isGenerating || !prompt.trim()}
            className="w-full"
          >
            {isGenerating ? (
              <>
                <i className="fas fa-spinner fa-spin mr-2" />
                생성 중...
              </>
            ) : (
              <>
                <i className="fas fa-magic mr-2" />
                AI로 생성하기
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {generatedContents.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>생성된 콘텐츠</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {generatedContents.map((content, index) => (
                <div
                  key={content.id}
                  className="p-4 border rounded-lg hover:border-primary/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="flex flex-col gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => handleMoveUp(index)}
                          disabled={index === 0}
                        >
                          <i className="fas fa-chevron-up text-xs" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => handleMoveDown(index)}
                          disabled={index === generatedContents.length - 1}
                        >
                          <i className="fas fa-chevron-down text-xs" />
                        </Button>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <i className={`${getContentTypeIcon(content.type)} text-primary`} />
                          <span className="font-medium">{content.title}</span>
                          <Badge variant="outline" className="text-xs">
                            {getContentTypeName(content.type)}
                          </Badge>
                        </div>
                        <pre className="text-sm text-muted-foreground whitespace-pre-wrap bg-muted p-3 rounded-md max-h-48 overflow-y-auto">
                          {content.content}
                        </pre>
                        <div className="text-xs text-muted-foreground mt-2">
                          생성일: {new Date(content.createdAt).toLocaleString('ko-KR')}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopyContent(content.content)}
                        title="복사"
                      >
                        <i className="fas fa-copy" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteContent(content.id)}
                        title="삭제"
                      >
                        <i className="fas fa-trash text-destructive" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {isGenerating && (
        <div className="fixed inset-0 bg-background/80 flex items-center justify-center z-50">
          <Card className="w-80">
            <CardContent className="pt-6">
              <LoadingSpinner message="AI가 콘텐츠를 생성하고 있습니다..." />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default AIContentGenerator;

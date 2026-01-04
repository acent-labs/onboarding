import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import LoadingSpinner from '../LoadingSpinner';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

interface ScenarioChoice {
  id: string;
  scenario_id: string;
  text: string;
  text_ko: string;
  display_order: number;
  is_recommended: boolean;
  is_active: boolean;
}

interface Scenario {
  id: string;
  category_id: string;
  title: string;
  title_ko: string;
  icon?: string;
  description: string;
  description_ko: string;
  display_order: number;
  is_active: boolean;
  choices?: ScenarioChoice[];
}

interface ScenarioCategory {
  id: string;
  name: string;
  name_ko: string;
  icon?: string;
  description?: string;
  description_ko?: string;
  display_order: number;
  is_active: boolean;
}

const ScenarioManagement: React.FC = () => {
  const [categories, setCategories] = useState<ScenarioCategory[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isScenarioDialogOpen, setIsScenarioDialogOpen] = useState(false);
  const [editingScenario, setEditingScenario] = useState<Scenario | null>(null);
  const [scenarioForm, setScenarioForm] = useState({
    id: '',
    category_id: '',
    title: '',
    title_ko: '',
    icon: '',
    description: '',
    description_ko: '',
    display_order: 0,
    is_active: true,
  });

  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ScenarioCategory | null>(null);
  const [categoryForm, setCategoryForm] = useState({
    id: '',
    name: '',
    name_ko: '',
    icon: '',
    description: '',
    description_ko: '',
    display_order: 0,
    is_active: true,
  });

  const [isSaving, setIsSaving] = useState(false);

  const getAuthHeaders = () => {
    const token = localStorage.getItem('auth_token') || '';
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    };
  };

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [categoriesRes, scenariosRes] = await Promise.all([
        fetch(`${API_BASE}/api/admin/categories`, { headers: getAuthHeaders() }),
        fetch(`${API_BASE}/api/admin/scenarios`, { headers: getAuthHeaders() }),
      ]);

      if (!categoriesRes.ok || !scenariosRes.ok) {
        throw new Error('데이터를 불러오는데 실패했습니다.');
      }

      const [categoriesData, scenariosData] = await Promise.all([
        categoriesRes.json(),
        scenariosRes.json(),
      ]);

      setCategories(categoriesData);
      setScenarios(scenariosData);
    } catch (e) {
      setError(e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openNewScenarioDialog = () => {
    setEditingScenario(null);
    setScenarioForm({
      id: '',
      category_id: categories[0]?.id || '',
      title: '',
      title_ko: '',
      icon: 'fas fa-lightbulb',
      description: '',
      description_ko: '',
      display_order: scenarios.length,
      is_active: true,
    });
    setIsScenarioDialogOpen(true);
  };

  const openEditScenarioDialog = (scenario: Scenario) => {
    setEditingScenario(scenario);
    setScenarioForm({
      id: scenario.id,
      category_id: scenario.category_id,
      title: scenario.title,
      title_ko: scenario.title_ko,
      icon: scenario.icon || '',
      description: scenario.description,
      description_ko: scenario.description_ko,
      display_order: scenario.display_order,
      is_active: scenario.is_active,
    });
    setIsScenarioDialogOpen(true);
  };

  const handleSaveScenario = async () => {
    setIsSaving(true);
    try {
      const url = editingScenario
        ? `${API_BASE}/api/admin/scenarios/${editingScenario.id}`
        : `${API_BASE}/api/admin/scenarios`;
      const method = editingScenario ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: getAuthHeaders(),
        body: JSON.stringify(scenarioForm),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || '저장에 실패했습니다.');
      }

      await loadData();
      setIsScenarioDialogOpen(false);
    } catch (e) {
      alert(e instanceof Error ? e.message : '저장에 실패했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteScenario = async (scenarioId: string) => {
    if (!confirm('이 시나리오를 삭제하시겠습니까?')) return;

    try {
      const response = await fetch(`${API_BASE}/api/admin/scenarios/${scenarioId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error('삭제에 실패했습니다.');
      }

      await loadData();
    } catch (e) {
      alert(e instanceof Error ? e.message : '삭제에 실패했습니다.');
    }
  };

  const openNewCategoryDialog = () => {
    setEditingCategory(null);
    setCategoryForm({
      id: '',
      name: '',
      name_ko: '',
      icon: 'fas fa-folder',
      description: '',
      description_ko: '',
      display_order: categories.length,
      is_active: true,
    });
    setIsCategoryDialogOpen(true);
  };

  const openEditCategoryDialog = (category: ScenarioCategory) => {
    setEditingCategory(category);
    setCategoryForm({
      id: category.id,
      name: category.name,
      name_ko: category.name_ko,
      icon: category.icon || '',
      description: category.description || '',
      description_ko: category.description_ko || '',
      display_order: category.display_order,
      is_active: category.is_active,
    });
    setIsCategoryDialogOpen(true);
  };

  const handleSaveCategory = async () => {
    setIsSaving(true);
    try {
      const url = editingCategory
        ? `${API_BASE}/api/admin/categories/${editingCategory.id}`
        : `${API_BASE}/api/admin/categories`;
      const method = editingCategory ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: getAuthHeaders(),
        body: JSON.stringify(categoryForm),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || '저장에 실패했습니다.');
      }

      await loadData();
      setIsCategoryDialogOpen(false);
    } catch (e) {
      alert(e instanceof Error ? e.message : '저장에 실패했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  const getCategoryName = (categoryId: string) => {
    const category = categories.find(c => c.id === categoryId);
    return category?.name_ko || categoryId;
  };

  if (isLoading) {
    return (
      <div className="py-8 text-center">
        <LoadingSpinner message="시나리오 데이터를 불러오는 중..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-8 text-center">
        <div className="text-destructive mb-4">{error}</div>
        <Button onClick={loadData}>다시 시도</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>카테고리 관리</CardTitle>
          <Button onClick={openNewCategoryDialog} size="sm">
            <i className="fas fa-plus mr-2" />
            카테고리 추가
          </Button>
        </CardHeader>
        <CardContent>
          {categories.length === 0 ? (
            <div className="text-center text-muted-foreground py-4">
              등록된 카테고리가 없습니다.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {categories.map((category) => (
                <div
                  key={category.id}
                  className="p-4 border rounded-lg hover:border-primary/50 transition-colors cursor-pointer"
                  onClick={() => openEditCategoryDialog(category)}
                >
                  <div className="flex items-center gap-3">
                    {category.icon && <i className={`${category.icon} text-primary`} />}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{category.name_ko}</div>
                      <div className="text-xs text-muted-foreground">{category.id}</div>
                    </div>
                    <Badge variant={category.is_active ? 'default' : 'secondary'}>
                      {category.is_active ? '활성' : '비활성'}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>시나리오 관리</CardTitle>
          <Button onClick={openNewScenarioDialog} size="sm">
            <i className="fas fa-plus mr-2" />
            시나리오 추가
          </Button>
        </CardHeader>
        <CardContent>
          {scenarios.length === 0 ? (
            <div className="text-center text-muted-foreground py-4">
              등록된 시나리오가 없습니다.
            </div>
          ) : (
            <div className="space-y-4">
              {categories.map((category) => {
                const categoryScenarios = scenarios.filter(s => s.category_id === category.id);
                if (categoryScenarios.length === 0) return null;

                return (
                  <div key={category.id}>
                    <h3 className="font-medium text-sm text-muted-foreground mb-2">
                      {category.name_ko}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {categoryScenarios.map((scenario) => (
                        <div
                          key={scenario.id}
                          className="p-4 border rounded-lg hover:border-primary/50 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                {scenario.icon && <i className={`${scenario.icon} text-primary text-sm`} />}
                                <span className="font-medium truncate">{scenario.title_ko}</span>
                              </div>
                              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                                {scenario.description_ko}
                              </p>
                              <div className="flex items-center gap-2 mt-2">
                                <Badge variant="outline" className="text-xs">
                                  {scenario.choices?.length || 0}개 선택지
                                </Badge>
                                <Badge variant={scenario.is_active ? 'default' : 'secondary'} className="text-xs">
                                  {scenario.is_active ? '활성' : '비활성'}
                                </Badge>
                              </div>
                            </div>
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openEditScenarioDialog(scenario)}
                              >
                                <i className="fas fa-edit" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteScenario(scenario.id)}
                              >
                                <i className="fas fa-trash text-destructive" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isScenarioDialogOpen} onOpenChange={setIsScenarioDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingScenario ? '시나리오 수정' : '새 시나리오 추가'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="scenario-id">시나리오 ID</Label>
                <Input
                  id="scenario-id"
                  value={scenarioForm.id}
                  onChange={(e) => setScenarioForm({ ...scenarioForm, id: e.target.value })}
                  placeholder="s1"
                  disabled={!!editingScenario}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="scenario-category">카테고리</Label>
                <select
                  id="scenario-category"
                  value={scenarioForm.category_id}
                  onChange={(e) => setScenarioForm({ ...scenarioForm, category_id: e.target.value })}
                  className="w-full h-10 px-3 rounded-md border border-input bg-background"
                >
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.name_ko}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="scenario-title">영문 제목</Label>
                <Input
                  id="scenario-title"
                  value={scenarioForm.title}
                  onChange={(e) => setScenarioForm({ ...scenarioForm, title: e.target.value })}
                  placeholder="Scenario Title"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="scenario-title-ko">한글 제목</Label>
                <Input
                  id="scenario-title-ko"
                  value={scenarioForm.title_ko}
                  onChange={(e) => setScenarioForm({ ...scenarioForm, title_ko: e.target.value })}
                  placeholder="시나리오 제목"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="scenario-icon">아이콘 클래스</Label>
                <Input
                  id="scenario-icon"
                  value={scenarioForm.icon}
                  onChange={(e) => setScenarioForm({ ...scenarioForm, icon: e.target.value })}
                  placeholder="fas fa-lightbulb"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="scenario-order">표시 순서</Label>
                <Input
                  id="scenario-order"
                  type="number"
                  value={scenarioForm.display_order}
                  onChange={(e) => setScenarioForm({ ...scenarioForm, display_order: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="scenario-desc">영문 설명</Label>
              <Textarea
                id="scenario-desc"
                value={scenarioForm.description}
                onChange={(e) => setScenarioForm({ ...scenarioForm, description: e.target.value })}
                placeholder="Scenario description..."
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="scenario-desc-ko">한글 설명</Label>
              <Textarea
                id="scenario-desc-ko"
                value={scenarioForm.description_ko}
                onChange={(e) => setScenarioForm({ ...scenarioForm, description_ko: e.target.value })}
                placeholder="시나리오 설명..."
                rows={3}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="scenario-active"
                checked={scenarioForm.is_active}
                onCheckedChange={(checked) => setScenarioForm({ ...scenarioForm, is_active: checked })}
              />
              <Label htmlFor="scenario-active">활성화</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsScenarioDialogOpen(false)}>
              취소
            </Button>
            <Button onClick={handleSaveScenario} disabled={isSaving}>
              {isSaving ? '저장 중...' : '저장'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isCategoryDialogOpen} onOpenChange={setIsCategoryDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingCategory ? '카테고리 수정' : '새 카테고리 추가'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="category-id">카테고리 ID</Label>
              <Input
                id="category-id"
                value={categoryForm.id}
                onChange={(e) => setCategoryForm({ ...categoryForm, id: e.target.value })}
                placeholder="productivity"
                disabled={!!editingCategory}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="category-name">영문 이름</Label>
                <Input
                  id="category-name"
                  value={categoryForm.name}
                  onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                  placeholder="Productivity"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category-name-ko">한글 이름</Label>
                <Input
                  id="category-name-ko"
                  value={categoryForm.name_ko}
                  onChange={(e) => setCategoryForm({ ...categoryForm, name_ko: e.target.value })}
                  placeholder="생산성"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="category-icon">아이콘 클래스</Label>
                <Input
                  id="category-icon"
                  value={categoryForm.icon}
                  onChange={(e) => setCategoryForm({ ...categoryForm, icon: e.target.value })}
                  placeholder="fas fa-folder"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category-order">표시 순서</Label>
                <Input
                  id="category-order"
                  type="number"
                  value={categoryForm.display_order}
                  onChange={(e) => setCategoryForm({ ...categoryForm, display_order: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="category-active"
                checked={categoryForm.is_active}
                onCheckedChange={(checked) => setCategoryForm({ ...categoryForm, is_active: checked })}
              />
              <Label htmlFor="category-active">활성화</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCategoryDialogOpen(false)}>
              취소
            </Button>
            <Button onClick={handleSaveCategory} disabled={isSaving}>
              {isSaving ? '저장 중...' : '저장'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ScenarioManagement;

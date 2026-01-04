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

interface CurriculumModule {
  id: string;
  slug: string;
  name_ko: string;
  name_en?: string;
  description_ko: string;
  description_en?: string;
  target_product_id: string;
  target_product_type: string;
  display_order: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

interface Product {
  id: string;
  name: string;
  name_ko?: string;
}

const CurriculumManagement: React.FC = () => {
  const [modules, setModules] = useState<CurriculumModule[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<string>('');

  const [isModuleDialogOpen, setIsModuleDialogOpen] = useState(false);
  const [editingModule, setEditingModule] = useState<CurriculumModule | null>(null);
  const [moduleForm, setModuleForm] = useState({
    slug: '',
    name_ko: '',
    name_en: '',
    description_ko: '',
    description_en: '',
    target_product_id: '',
    target_product_type: 'module',
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

  const loadProducts = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/products`, {
        headers: getAuthHeaders(),
      });
      if (response.ok) {
        const data = await response.json();
        setProducts(data);
        if (data.length > 0 && !selectedProductId) {
          setSelectedProductId(data[0].id);
        }
      }
    } catch (e) {
      console.error('Failed to load products:', e);
    }
  }, [selectedProductId]);

  const loadModules = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const url = selectedProductId
        ? `${API_BASE}/api/admin/modules?product_id=${selectedProductId}`
        : `${API_BASE}/api/admin/modules`;
      
      const response = await fetch(url, { headers: getAuthHeaders() });

      if (!response.ok) {
        throw new Error('모듈 데이터를 불러오는데 실패했습니다.');
      }

      const data = await response.json();
      setModules(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, [selectedProductId]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    if (selectedProductId) {
      loadModules();
    }
  }, [selectedProductId, loadModules]);

  const openNewModuleDialog = () => {
    setEditingModule(null);
    setModuleForm({
      slug: '',
      name_ko: '',
      name_en: '',
      description_ko: '',
      description_en: '',
      target_product_id: selectedProductId || products[0]?.id || '',
      target_product_type: 'module',
      display_order: modules.length,
      is_active: true,
    });
    setIsModuleDialogOpen(true);
  };

  const openEditModuleDialog = (module: CurriculumModule) => {
    setEditingModule(module);
    setModuleForm({
      slug: module.slug,
      name_ko: module.name_ko,
      name_en: module.name_en || '',
      description_ko: module.description_ko,
      description_en: module.description_en || '',
      target_product_id: module.target_product_id,
      target_product_type: module.target_product_type,
      display_order: module.display_order,
      is_active: module.is_active,
    });
    setIsModuleDialogOpen(true);
  };

  const handleSaveModule = async () => {
    setIsSaving(true);
    try {
      const url = editingModule
        ? `${API_BASE}/api/admin/modules/${editingModule.id}`
        : `${API_BASE}/api/admin/modules`;
      const method = editingModule ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: getAuthHeaders(),
        body: JSON.stringify(moduleForm),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || '저장에 실패했습니다.');
      }

      await loadModules();
      setIsModuleDialogOpen(false);
    } catch (e) {
      alert(e instanceof Error ? e.message : '저장에 실패했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteModule = async (moduleId: string) => {
    if (!confirm('이 모듈을 삭제하시겠습니까?')) return;

    try {
      const response = await fetch(`${API_BASE}/api/admin/modules/${moduleId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error('삭제에 실패했습니다.');
      }

      await loadModules();
    } catch (e) {
      alert(e instanceof Error ? e.message : '삭제에 실패했습니다.');
    }
  };

  const handleReorder = async (moduleId: string, direction: 'up' | 'down') => {
    const currentIndex = modules.findIndex(m => m.id === moduleId);
    if (currentIndex === -1) return;

    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex < 0 || newIndex >= modules.length) return;

    try {
      await fetch(`${API_BASE}/api/admin/modules/${moduleId}/reorder?new_order=${newIndex}`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      await loadModules();
    } catch (e) {
      console.error('Failed to reorder:', e);
    }
  };

  const getProductName = (productId: string) => {
    const product = products.find(p => p.id === productId);
    return product?.name_ko || product?.name || productId;
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('ko-KR');
  };

  if (isLoading && modules.length === 0) {
    return (
      <div className="py-8 text-center">
        <LoadingSpinner message="커리큘럼 데이터를 불러오는 중..." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>커리큘럼 모듈 관리</CardTitle>
          <div className="flex items-center gap-3">
            <select
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              className="h-9 px-3 rounded-md border border-input bg-background text-sm"
            >
              <option value="">전체 제품</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name_ko || product.name}
                </option>
              ))}
            </select>
            <Button onClick={openNewModuleDialog} size="sm">
              <i className="fas fa-plus mr-2" />
              모듈 추가
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="py-8 text-center">
              <div className="text-destructive mb-4">{error}</div>
              <Button onClick={loadModules}>다시 시도</Button>
            </div>
          ) : modules.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              <i className="fas fa-book text-3xl mb-2" />
              <p>등록된 모듈이 없습니다.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {modules.map((module, index) => (
                <div
                  key={module.id}
                  className="p-4 border rounded-lg hover:border-primary/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="flex flex-col gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => handleReorder(module.id, 'up')}
                          disabled={index === 0}
                        >
                          <i className="fas fa-chevron-up text-xs" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => handleReorder(module.id, 'down')}
                          disabled={index === modules.length - 1}
                        >
                          <i className="fas fa-chevron-down text-xs" />
                        </Button>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{module.name_ko}</span>
                          <Badge variant="outline" className="text-xs">
                            {module.slug}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                          {module.description_ko}
                        </p>
                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                          <span>제품: {getProductName(module.target_product_id)}</span>
                          <span>타입: {module.target_product_type}</span>
                          <span>수정일: {formatDate(module.updated_at)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={module.is_active ? 'default' : 'secondary'}>
                        {module.is_active ? '활성' : '비활성'}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditModuleDialog(module)}
                      >
                        <i className="fas fa-edit" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteModule(module.id)}
                      >
                        <i className="fas fa-trash text-destructive" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isModuleDialogOpen} onOpenChange={setIsModuleDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingModule ? '모듈 수정' : '새 모듈 추가'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="module-slug">슬러그 (URL용)</Label>
                <Input
                  id="module-slug"
                  value={moduleForm.slug}
                  onChange={(e) => setModuleForm({ ...moduleForm, slug: e.target.value })}
                  placeholder="module-slug"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="module-product">대상 제품</Label>
                <select
                  id="module-product"
                  value={moduleForm.target_product_id}
                  onChange={(e) => setModuleForm({ ...moduleForm, target_product_id: e.target.value })}
                  className="w-full h-10 px-3 rounded-md border border-input bg-background"
                >
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name_ko || product.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="module-name-ko">한글 이름</Label>
                <Input
                  id="module-name-ko"
                  value={moduleForm.name_ko}
                  onChange={(e) => setModuleForm({ ...moduleForm, name_ko: e.target.value })}
                  placeholder="모듈 이름"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="module-name-en">영문 이름</Label>
                <Input
                  id="module-name-en"
                  value={moduleForm.name_en}
                  onChange={(e) => setModuleForm({ ...moduleForm, name_en: e.target.value })}
                  placeholder="Module Name"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="module-desc-ko">한글 설명</Label>
              <Textarea
                id="module-desc-ko"
                value={moduleForm.description_ko}
                onChange={(e) => setModuleForm({ ...moduleForm, description_ko: e.target.value })}
                placeholder="모듈 설명..."
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="module-desc-en">영문 설명</Label>
              <Textarea
                id="module-desc-en"
                value={moduleForm.description_en}
                onChange={(e) => setModuleForm({ ...moduleForm, description_en: e.target.value })}
                placeholder="Module description..."
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="module-type">제품 타입</Label>
                <select
                  id="module-type"
                  value={moduleForm.target_product_type}
                  onChange={(e) => setModuleForm({ ...moduleForm, target_product_type: e.target.value })}
                  className="w-full h-10 px-3 rounded-md border border-input bg-background"
                >
                  <option value="module">모듈</option>
                  <option value="bundle">번들</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="module-order">표시 순서</Label>
                <Input
                  id="module-order"
                  type="number"
                  value={moduleForm.display_order}
                  onChange={(e) => setModuleForm({ ...moduleForm, display_order: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="module-active"
                checked={moduleForm.is_active}
                onCheckedChange={(checked) => setModuleForm({ ...moduleForm, is_active: checked })}
              />
              <Label htmlFor="module-active">활성화</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModuleDialogOpen(false)}>
              취소
            </Button>
            <Button onClick={handleSaveModule} disabled={isSaving}>
              {isSaving ? '저장 중...' : '저장'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CurriculumManagement;

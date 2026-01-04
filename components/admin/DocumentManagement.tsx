import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import LoadingSpinner from '../LoadingSpinner';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

const MAX_FILE_SIZE_MB = 50;
const ALLOWED_EXTENSIONS = ['.pdf', '.csv', '.txt'];

interface UploadedDocument {
  id: string;
  filename: string;
  file_type: string;
  file_size: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  message?: string;
  product_id?: string;
  category_id?: string;
  uploaded_at: string;
}

interface Product {
  id: string;
  name: string;
  name_ko?: string;
}

const DocumentManagement: React.FC = () => {
  const [documents, setDocuments] = useState<UploadedDocument[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const getAuthHeaders = () => {
    const token = localStorage.getItem('auth_token') || '';
    return {
      'Authorization': `Bearer ${token}`,
    };
  };

  const loadProducts = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/products`, {
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      });
      if (response.ok) {
        const data = await response.json();
        setProducts(data);
      }
    } catch (e) {
      console.error('Failed to load products:', e);
    }
  }, []);

  const loadDocuments = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/api/documents`, {
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error('문서 목록을 불러오는데 실패했습니다.');
      }

      const data = await response.json();
      const formattedDocs: UploadedDocument[] = (data || []).map((doc: any) => ({
        id: doc.name || doc.id,
        filename: doc.displayName || doc.filename || doc.name,
        file_type: doc.mimeType || doc.file_type || 'unknown',
        file_size: doc.sizeBytes || doc.file_size || 0,
        status: 'completed' as const,
        product_id: doc.customMetadata?.find((m: any) => m.key === 'product_id')?.stringValue,
        category_id: doc.customMetadata?.find((m: any) => m.key === 'category_id')?.stringValue,
        uploaded_at: doc.createTime || doc.uploaded_at || new Date().toISOString(),
      }));
      setDocuments(formattedDocs);
    } catch (e) {
      setError(e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProducts();
    loadDocuments();
  }, [loadProducts, loadDocuments]);

  const validateFile = (file: File): string | null => {
    const extension = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      return `지원하지 않는 파일 형식입니다. 허용: ${ALLOWED_EXTENSIONS.join(', ')}`;
    }

    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      return `파일 크기가 ${MAX_FILE_SIZE_MB}MB를 초과합니다.`;
    }

    return null;
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const validationError = validateFile(file);
    if (validationError) {
      setUploadError(validationError);
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    setUploadError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      if (selectedProductId) {
        formData.append('product_id', selectedProductId);
      }
      if (selectedCategoryId) {
        formData.append('category_id', selectedCategoryId);
      }

      const xhr = new XMLHttpRequest();
      
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const progress = Math.round((e.loaded / e.total) * 100);
          setUploadProgress(progress);
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const response = JSON.parse(xhr.responseText);
          const newDoc: UploadedDocument = {
            id: response.id,
            filename: response.filename,
            file_type: response.file_type,
            file_size: response.file_size,
            status: response.status || 'pending',
            message: response.message,
            product_id: selectedProductId || undefined,
            category_id: selectedCategoryId || undefined,
            uploaded_at: new Date().toISOString(),
          };
          setDocuments(prev => [newDoc, ...prev]);
          setUploadProgress(100);
        } else {
          const errorData = JSON.parse(xhr.responseText);
          throw new Error(errorData.detail || '업로드에 실패했습니다.');
        }
        setIsUploading(false);
      });

      xhr.addEventListener('error', () => {
        setUploadError('네트워크 오류가 발생했습니다.');
        setIsUploading(false);
      });

      xhr.open('POST', `${API_BASE}/api/admin/documents/upload`);
      const token = localStorage.getItem('auth_token') || '';
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.send(formData);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : '업로드에 실패했습니다.');
      setIsUploading(false);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDeleteDocument = async (docId: string, filename: string) => {
    if (!confirm(`"${filename}" 문서를 삭제하시겠습니까?`)) return;

    try {
      const response = await fetch(`${API_BASE}/api/documents/${encodeURIComponent(docId)}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error('삭제에 실패했습니다.');
      }

      setDocuments(prev => prev.filter(d => d.id !== docId));
    } catch (e) {
      alert(e instanceof Error ? e.message : '삭제에 실패했습니다.');
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('ko-KR');
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-500/20 text-green-600 border-green-500/30">완료</Badge>;
      case 'processing':
        return <Badge className="bg-blue-500/20 text-blue-600 border-blue-500/30">처리 중</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-500/20 text-yellow-600 border-yellow-500/30">대기</Badge>;
      case 'failed':
        return <Badge variant="destructive">실패</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getFileIcon = (fileType: string) => {
    if (fileType.includes('pdf')) return 'fas fa-file-pdf text-red-500';
    if (fileType.includes('csv')) return 'fas fa-file-csv text-green-500';
    if (fileType.includes('text')) return 'fas fa-file-alt text-blue-500';
    return 'fas fa-file text-muted-foreground';
  };

  const getProductName = (productId?: string) => {
    if (!productId) return '-';
    const product = products.find(p => p.id === productId);
    return product?.name_ko || product?.name || productId;
  };

  if (isLoading && documents.length === 0) {
    return (
      <div className="py-8 text-center">
        <LoadingSpinner message="문서 목록을 불러오는 중..." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>RAG 문서 업로드</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="upload-product">대상 제품 (선택)</Label>
              <select
                id="upload-product"
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
                className="w-full h-10 px-3 rounded-md border border-input bg-background"
              >
                <option value="">전체 (제품 미지정)</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name_ko || product.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="upload-category">카테고리 ID (선택)</Label>
              <Input
                id="upload-category"
                value={selectedCategoryId}
                onChange={(e) => setSelectedCategoryId(e.target.value)}
                placeholder="예: getting-started"
              />
            </div>
          </div>

          <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
            <input
              ref={fileInputRef}
              type="file"
              accept={ALLOWED_EXTENSIONS.join(',')}
              onChange={handleFileSelect}
              className="hidden"
              id="file-upload"
              disabled={isUploading}
            />
            <label
              htmlFor="file-upload"
              className={`cursor-pointer ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <i className="fas fa-cloud-upload-alt text-4xl text-muted-foreground mb-4" />
              <p className="text-sm text-muted-foreground mb-2">
                클릭하여 파일을 선택하거나 드래그 앤 드롭하세요
              </p>
              <p className="text-xs text-muted-foreground">
                지원 형식: PDF, CSV, TXT (최대 {MAX_FILE_SIZE_MB}MB)
              </p>
            </label>
          </div>

          {isUploading && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>업로드 중...</span>
                <span>{uploadProgress}%</span>
              </div>
              <Progress value={uploadProgress} className="h-2" />
            </div>
          )}

          {uploadError && (
            <div className="p-3 rounded-md border border-destructive/40 bg-destructive/10 text-sm text-destructive">
              {uploadError}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>업로드된 문서</CardTitle>
          <Button variant="outline" size="sm" onClick={loadDocuments}>
            <i className="fas fa-sync-alt mr-2" />
            새로고침
          </Button>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="py-8 text-center">
              <div className="text-destructive mb-4">{error}</div>
              <Button onClick={loadDocuments}>다시 시도</Button>
            </div>
          ) : documents.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              <i className="fas fa-folder-open text-3xl mb-2" />
              <p>업로드된 문서가 없습니다.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="p-4 border rounded-lg hover:border-primary/50 transition-colors"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center">
                        <i className={getFileIcon(doc.file_type)} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{doc.filename}</div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span>{formatFileSize(doc.file_size)}</span>
                          <span>제품: {getProductName(doc.product_id)}</span>
                          <span>{formatDate(doc.uploaded_at)}</span>
                        </div>
                        {doc.message && (
                          <div className="text-xs text-muted-foreground mt-1">
                            {doc.message}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {getStatusBadge(doc.status)}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteDocument(doc.id, doc.filename)}
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
    </div>
  );
};

export default DocumentManagement;

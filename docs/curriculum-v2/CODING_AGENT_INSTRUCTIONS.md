# Freshdesk Phase 1 온보딩 커리큘럼 마이그레이션 가이드

## 📋 개요
이 문서는 코딩 에이전트가 `freshdesk_phase1_onboarding_COMPLETE.json` 파일을 Supabase 데이터베이스로 마이그레이션하는 작업을 수행하기 위한 완전한 지침서입니다.

---

## 🎯 작업 목표
- JSON 파일에서 Phase 1 온보딩 커리큘럼 데이터(4개 모듈)를 읽어들입니다.
- Supabase의 3개 테이블(`curriculum_modules`, `module_contents`, `quiz_questions`)에 데이터를 삽입합니다.
- 모든 ID는 UUID 형식으로 변환하고, 관계 무결성을 유지합니다.

---

## 📁 입력 파일 정보

### 파일명
`freshdesk_phase1_onboarding_COMPLETE.json`

### 파일 위치
- **AI Drive 경로**: `/freshdesk_curriculum/freshdesk_phase1_onboarding_COMPLETE.json`
- **다운로드 링크**: (1시간 유효, 만료 시 재발급 필요)

### 파일 구조
```json
{
  "phase_info": {
    "phase_number": 1,
    "phase_name_ko": "온보딩 (Foundation)",
    "phase_name_en": "Onboarding (Foundation)",
    "description": "...",
    "target_audience": "...",
    "learning_objectives": [...],
    "total_modules": 4,
    "total_estimated_minutes": 188
  },
  "modules": [
    {
      "module_id": "new-fd-onboarding-01",
      "module_name_ko": "Freshdesk 시작하기",
      "module_name_en": "Getting Started with Freshdesk",
      "module_slug": "getting-started",
      "display_order": 1,
      "estimated_minutes": 42,
      "description": "...",
      "learning_objectives": [...],
      "prerequisite_module_ids": [],
      "feature_tags": [...],
      "sections": [
        {
          "section_id": "01-01",
          "section_type": "overview",
          "section_name_ko": "...",
          "section_name_en": "...",
          "estimated_minutes": 5,
          "level": "basic",
          "content_md": "...",
          "quiz_questions": [...]
        },
        ...
      ]
    },
    ...
  ]
}
```

---

## 🗄️ Supabase 테이블 스키마

### 1. `curriculum_modules` 테이블

#### 컬럼 구조
| 컬럼명 | 데이터 타입 | 제약조건 | 설명 |
|--------|-------------|----------|------|
| `id` | UUID | PRIMARY KEY | 모듈 고유 식별자 |
| `target_product_id` | VARCHAR | NOT NULL | 제품 ID (예: 'freshdesk') |
| `target_product_type` | VARCHAR | NOT NULL | 제품 타입 (예: 'module') |
| `name_ko` | VARCHAR | NOT NULL | 한국어 모듈명 |
| `name_en` | VARCHAR | NOT NULL | 영어 모듈명 |
| `slug` | VARCHAR | UNIQUE, NOT NULL | URL 슬러그 |
| `description` | TEXT | | 모듈 설명 |
| `icon` | VARCHAR | | FontAwesome 아이콘 클래스 |
| `display_order` | INTEGER | NOT NULL | 표시 순서 |
| `estimated_minutes` | INTEGER | NOT NULL | 예상 학습 시간(분) |
| `learning_objectives` | TEXT | | 학습 목표 |
| `content_strategy` | VARCHAR | | 콘텐츠 전략 (예: 'hybrid') |
| `kb_category_slug` | VARCHAR | | 지식베이스 카테고리 슬러그 |
| `prerequisite_module_ids` | JSONB | DEFAULT '[]' | 선수 모듈 ID 배열 |
| `feature_tags` | JSONB | DEFAULT '[]' | 기능 태그 배열 |
| `is_active` | BOOLEAN | DEFAULT TRUE | 활성화 여부 |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | 생성 일시 |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW() | 수정 일시 |

#### 매핑 규칙
```javascript
// JSON → Supabase 매핑
{
  id: generateUUID(),  // "new-fd-onboarding-01" → UUID 변환
  target_product_id: 'freshdesk',
  target_product_type: 'module',
  name_ko: module.module_name_ko,
  name_en: module.module_name_en,
  slug: module.module_slug,
  description: module.description,
  icon: 'fa-book',  // 기본값
  display_order: module.display_order,
  estimated_minutes: module.estimated_minutes,
  learning_objectives: JSON.stringify(module.learning_objectives),
  content_strategy: 'hybrid',
  kb_category_slug: null,
  prerequisite_module_ids: JSON.stringify(module.prerequisite_module_ids),
  feature_tags: JSON.stringify(module.feature_tags),
  is_active: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
}
```

---

### 2. `module_contents` 테이블

#### 컬럼 구조
| 컬럼명 | 데이터 타입 | 제약조건 | 설명 |
|--------|-------------|----------|------|
| `id` | UUID | PRIMARY KEY | 섹션 고유 식별자 |
| `module_id` | UUID | FOREIGN KEY → curriculum_modules(id) | 부모 모듈 ID |
| `section_type` | VARCHAR | NOT NULL | 섹션 유형 (overview, concept, feature-guide, practice, quiz, reference) |
| `level` | VARCHAR | NOT NULL | 난이도 (basic, intermediate, advanced) |
| `title_ko` | VARCHAR | NOT NULL | 한국어 섹션 제목 |
| `title_en` | VARCHAR | NOT NULL | 영어 섹션 제목 |
| `content_md` | TEXT | NOT NULL | 마크다운 형식 본문 |
| `display_order` | INTEGER | NOT NULL | 섹션 표시 순서 |
| `estimated_minutes` | INTEGER | NOT NULL | 예상 학습 시간(분) |
| `is_active` | BOOLEAN | DEFAULT TRUE | 활성화 여부 |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | 생성 일시 |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW() | 수정 일시 |

#### 매핑 규칙
```javascript
// JSON → Supabase 매핑
{
  id: generateUUID(),  // "01-01" → UUID 변환
  module_id: mappedModuleUUID,  // 위에서 생성한 모듈 UUID
  section_type: section.section_type,
  level: section.level,
  title_ko: section.section_name_ko,
  title_en: section.section_name_en,
  content_md: section.content_md,
  display_order: sectionIndex + 1,
  estimated_minutes: section.estimated_minutes,
  is_active: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
}
```

---

### 3. `quiz_questions` 테이블

#### 컬럼 구조
| 컬럼명 | 데이터 타입 | 제약조건 | 설명 |
|--------|-------------|----------|------|
| `id` | UUID | PRIMARY KEY | 퀴즈 고유 식별자 |
| `module_id` | UUID | FOREIGN KEY → curriculum_modules(id) | 부모 모듈 ID |
| `difficulty` | VARCHAR | NOT NULL | 난이도 (basic, intermediate, advanced) |
| `question_order` | INTEGER | NOT NULL | 질문 순서 |
| `question` | TEXT | NOT NULL | 질문 내용 |
| `context` | TEXT | | 질문 맥락/출처 |
| `choices` | JSONB | NOT NULL | 선택지 배열 [{"id":"a","text":"..."}] |
| `correct_choice_id` | VARCHAR | NOT NULL | 정답 ID (a, b, c, d) |
| `explanation` | TEXT | NOT NULL | 정답 해설 |
| `learning_point` | TEXT | | 학습 포인트 |
| `related_doc_url` | VARCHAR | | 관련 문서 URL |
| `quality_rating` | INTEGER | | 품질 등급 (1~5) |
| `is_verified` | BOOLEAN | DEFAULT FALSE | 검증 여부 |
| `reviewed_by` | VARCHAR | | 검토자 |
| `reviewed_at` | TIMESTAMPTZ | | 검토 일시 |
| `is_active` | BOOLEAN | DEFAULT TRUE | 활성화 여부 |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | 생성 일시 |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW() | 수정 일시 |

#### 매핑 규칙
```javascript
// JSON → Supabase 매핑 (section.section_type === 'quiz'인 경우)
// section.quiz_questions 배열을 순회
{
  id: generateUUID(),
  module_id: mappedModuleUUID,
  difficulty: section.level,
  question_order: quizIndex + 1,
  question: quiz.question,
  context: quiz.context || null,
  choices: JSON.stringify(quiz.choices),  // [{"id":"a","text":"..."}]
  correct_choice_id: quiz.correct_answer,
  explanation: quiz.explanation,
  learning_point: quiz.learning_point || null,
  related_doc_url: null,
  quality_rating: null,
  is_verified: false,
  reviewed_by: null,
  reviewed_at: null,
  is_active: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
}
```

---

## 🔧 구현 단계

### Step 1: JSON 파일 읽기 및 파싱
```javascript
// Node.js 예시
const fs = require('fs');
const data = JSON.parse(
  fs.readFileSync('freshdesk_phase1_onboarding_COMPLETE.json', 'utf8')
);

console.log(`Phase: ${data.phase_info.phase_name_ko}`);
console.log(`Total modules: ${data.phase_info.total_modules}`);
```

### Step 2: UUID 매핑 테이블 생성
```javascript
const { v4: uuidv4 } = require('uuid');

// 모듈 ID 매핑 (문자열 → UUID)
const moduleIdMap = new Map();
data.modules.forEach(module => {
  moduleIdMap.set(module.module_id, uuidv4());
});

// 섹션 ID 매핑 (문자열 → UUID)
const sectionIdMap = new Map();
data.modules.forEach(module => {
  module.sections.forEach(section => {
    const key = `${module.module_id}::${section.section_id}`;
    sectionIdMap.set(key, uuidv4());
  });
});
```

### Step 3: Supabase 연결 설정
```javascript
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
```

### Step 4: 모듈 데이터 삽입
```javascript
for (const module of data.modules) {
  const moduleUUID = moduleIdMap.get(module.module_id);
  
  const { data: insertedModule, error } = await supabase
    .from('curriculum_modules')
    .insert({
      id: moduleUUID,
      target_product_id: 'freshdesk',
      target_product_type: 'module',
      name_ko: module.module_name_ko,
      name_en: module.module_name_en,
      slug: module.module_slug,
      description: module.description,
      icon: 'fa-book',
      display_order: module.display_order,
      estimated_minutes: module.estimated_minutes,
      learning_objectives: JSON.stringify(module.learning_objectives),
      content_strategy: 'hybrid',
      prerequisite_module_ids: JSON.stringify(
        module.prerequisite_module_ids.map(id => moduleIdMap.get(id))
      ),
      feature_tags: JSON.stringify(module.feature_tags),
      is_active: true
    });
    
  if (error) {
    console.error(`모듈 삽입 실패: ${module.module_name_ko}`, error);
  } else {
    console.log(`✅ 모듈 삽입 성공: ${module.module_name_ko}`);
  }
}
```

### Step 5: 섹션 데이터 삽입
```javascript
for (const module of data.modules) {
  const moduleUUID = moduleIdMap.get(module.module_id);
  
  for (let i = 0; i < module.sections.length; i++) {
    const section = module.sections[i];
    const sectionKey = `${module.module_id}::${section.section_id}`;
    const sectionUUID = sectionIdMap.get(sectionKey);
    
    const { error } = await supabase
      .from('module_contents')
      .insert({
        id: sectionUUID,
        module_id: moduleUUID,
        section_type: section.section_type,
        level: section.level,
        title_ko: section.section_name_ko,
        title_en: section.section_name_en,
        content_md: section.content_md,
        display_order: i + 1,
        estimated_minutes: section.estimated_minutes,
        is_active: true
      });
      
    if (error) {
      console.error(`섹션 삽입 실패: ${section.section_name_ko}`, error);
    } else {
      console.log(`✅ 섹션 삽입 성공: ${section.section_name_ko}`);
    }
  }
}
```

### Step 6: 퀴즈 데이터 삽입
```javascript
for (const module of data.modules) {
  const moduleUUID = moduleIdMap.get(module.module_id);
  
  for (const section of module.sections) {
    // 퀴즈가 있는 섹션만 처리
    if (section.quiz_questions && section.quiz_questions.length > 0) {
      for (let i = 0; i < section.quiz_questions.length; i++) {
        const quiz = section.quiz_questions[i];
        
        const { error } = await supabase
          .from('quiz_questions')
          .insert({
            id: uuidv4(),
            module_id: moduleUUID,
            difficulty: section.level,
            question_order: i + 1,
            question: quiz.question,
            context: quiz.context || null,
            choices: JSON.stringify(quiz.choices),
            correct_choice_id: quiz.correct_answer,
            explanation: quiz.explanation,
            learning_point: quiz.learning_point || null,
            is_verified: false,
            is_active: true
          });
          
        if (error) {
          console.error(`퀴즈 삽입 실패: ${quiz.question.substring(0, 50)}...`, error);
        } else {
          console.log(`✅ 퀴즈 삽입 성공`);
        }
      }
    }
  }
}
```

---

## ⚠️ 주의사항

### 1. UUID 변환 필수
- JSON의 모든 ID (`module_id`, `section_id`)는 문자열입니다.
- Supabase는 UUID 타입을 사용하므로 반드시 변환해야 합니다.
- 변환 후 매핑 테이블(Map)을 유지하여 외래 키 관계를 올바르게 설정하세요.

### 2. JSONB 데이터 직렬화
- `learning_objectives`, `prerequisite_module_ids`, `feature_tags`, `choices`는 JSONB 타입입니다.
- JavaScript에서는 `JSON.stringify()`로 변환 후 삽입합니다.

### 3. 외래 키 순서
- **반드시** `curriculum_modules` → `module_contents` → `quiz_questions` 순서로 삽입하세요.
- 부모 레코드가 존재해야 자식 레코드를 삽입할 수 있습니다.

### 4. 트랜잭션 권장
- 가능하다면 전체 삽입을 하나의 트랜잭션으로 처리하세요.
- 중간에 오류 발생 시 롤백할 수 있도록 합니다.

### 5. 중복 체크
- 기존 데이터가 있는지 확인 후 삽입하세요.
- `slug` 컬럼은 UNIQUE 제약이 있으므로 중복 시 오류가 발생합니다.

---

## ✅ 검증 체크리스트

삽입 완료 후 다음 SQL 쿼리로 데이터를 검증하세요:

```sql
-- 1. 모듈 개수 확인 (4개여야 함)
SELECT COUNT(*) FROM curriculum_modules 
WHERE target_product_id = 'freshdesk';

-- 2. 총 섹션 개수 확인
SELECT COUNT(*) FROM module_contents mc
JOIN curriculum_modules cm ON mc.module_id = cm.id
WHERE cm.target_product_id = 'freshdesk';

-- 3. 총 퀴즈 개수 확인
SELECT COUNT(*) FROM quiz_questions qq
JOIN curriculum_modules cm ON qq.module_id = cm.id
WHERE cm.target_product_id = 'freshdesk';

-- 4. 모듈별 섹션 개수
SELECT 
  cm.name_ko,
  cm.display_order,
  COUNT(mc.id) as section_count
FROM curriculum_modules cm
LEFT JOIN module_contents mc ON cm.id = mc.module_id
WHERE cm.target_product_id = 'freshdesk'
GROUP BY cm.id, cm.name_ko, cm.display_order
ORDER BY cm.display_order;

-- 5. 모듈별 퀴즈 개수
SELECT 
  cm.name_ko,
  COUNT(qq.id) as quiz_count
FROM curriculum_modules cm
LEFT JOIN quiz_questions qq ON cm.id = qq.module_id
WHERE cm.target_product_id = 'freshdesk'
GROUP BY cm.id, cm.name_ko
ORDER BY cm.display_order;

-- 6. 외래 키 무결성 확인 (고아 레코드 체크)
-- module_contents에서 존재하지 않는 module_id 참조
SELECT mc.* FROM module_contents mc
LEFT JOIN curriculum_modules cm ON mc.module_id = cm.id
WHERE cm.id IS NULL;

-- quiz_questions에서 존재하지 않는 module_id 참조
SELECT qq.* FROM quiz_questions qq
LEFT JOIN curriculum_modules cm ON qq.module_id = cm.id
WHERE cm.id IS NULL;
```

### 예상 결과
- **총 모듈**: 4개
- **모듈 1**: "Freshdesk 시작하기" - 약 7~8개 섹션
- **모듈 2**: "티켓 개념 및 기본 이해" - 약 6~7개 섹션
- **모듈 3**: "팀 및 권한 설정" - 약 6~7개 섹션
- **모듈 4**: "기본 티켓 처리 워크플로우" - 약 6~7개 섹션
- **총 퀴즈**: 모듈당 3~5개 (총 12~20개 예상)

---

## 🔄 롤백 방법

문제 발생 시 다음 순서로 데이터를 삭제하세요:

```sql
-- 1. 퀴즈 삭제
DELETE FROM quiz_questions 
WHERE module_id IN (
  SELECT id FROM curriculum_modules 
  WHERE target_product_id = 'freshdesk'
);

-- 2. 섹션 삭제
DELETE FROM module_contents 
WHERE module_id IN (
  SELECT id FROM curriculum_modules 
  WHERE target_product_id = 'freshdesk'
);

-- 3. 모듈 삭제
DELETE FROM curriculum_modules 
WHERE target_product_id = 'freshdesk';
```

---

## 📊 완료 보고서 템플릿

작업 완료 후 다음 형식으로 보고하세요:

```
✅ Freshdesk Phase 1 온보딩 커리큘럼 마이그레이션 완료

📌 삽입 결과
- 모듈: 4개
- 섹션: XX개
- 퀴즈: XX개

📝 모듈 목록
1. [UUID] Freshdesk 시작하기 (42분, X개 섹션, X개 퀴즈)
2. [UUID] 티켓 개념 및 기본 이해 (48분, X개 섹션, X개 퀴즈)
3. [UUID] 팀 및 권한 설정 (48분, X개 섹션, X개 퀴즈)
4. [UUID] 기본 티켓 처리 워크플로우 (50분, X개 섹션, X개 퀴즈)

⚠️ 발생한 오류: (있다면 기재)

✅ 검증 완료
- 외래 키 무결성: OK
- 중복 데이터: 없음
- 필수 필드 누락: 없음
```

---

## 📞 지원

작업 중 문제가 발생하면 다음 정보를 포함하여 질문하세요:
1. 어느 단계에서 오류가 발생했는지
2. 오류 메시지 전문
3. 현재까지 삽입된 데이터 개수
4. 사용 중인 환경 (Node.js 버전, Supabase 클라이언트 버전)

---

## 📚 참고 자료
- JSON 파일 위치: `/freshdesk_curriculum/freshdesk_phase1_onboarding_COMPLETE.json`
- 총 학습 시간: 188분 (약 3.1시간)
- 대상 제품: Freshdesk
- Phase: 1 (온보딩 Foundation)
- 대상 사용자: Freshdesk 신규 사용자 및 CS 담당자

---

**작성일**: 2026-01-04  
**버전**: 1.0  
**작성자**: 프로덕트 어시스트 AI

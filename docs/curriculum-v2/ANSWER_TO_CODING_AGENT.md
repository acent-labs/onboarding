# 코딩 에이전트 질문에 대한 답변

## 📋 질문 요약

### 질문 1: Freshdesk Phase1(온보딩 Foundation) 4개 모듈을 어디에 불러올까요?
- **A안**: 기존 `target_product_id='freshdesk'` 커리큘럼에 추가(총 모듈 수 증가, UI에 함께 표시)
- **B안**: 별도 제품/트랙으로 분리(예: `target_product_id='freshdesk_onboarding'`), 제품 선택 화면에 새 항목 추가
- **C안**: `freshdesk`에 속하되 `feature_tags`나 slug prefix로 "onboarding" 구분(필터링/표시 로직 추가하는 전제)

### 질문 2: Phase1 퀴즈는 어떻게 처리할까요?
현재 JSON은 모듈 1~2만 객관식 `quiz_questions`가 있고, 모듈 3~4는 퀴즈가 `content_md`로만 존재합니다.
- **A안**: JSON에 있는 퀴즈만 DB에 시드(모듈 1~2). 모듈 3~4는 DB 퀴즈가 없으니 백엔드의 AI 생성 폴백에 맡김
- **B안**: 4개 모듈 모두 DB에 퀴즈를 별도로 작성/변환 필요

---

## ✅ 우리의 결정 사항 (대체 방식)

### 🎯 핵심 결정
**우리는 기존 Freshdesk 모듈을 완전히 대체(교체)하기로 결정했습니다.**

이는 다음을 의미합니다:
- 기존 11개 Freshdesk 모듈을 삭제 또는 비활성화
- 새로운 Phase 1 온보딩 4개 모듈로 교체
- **추가가 아닌 대체(replacement)**

---

## 📊 현재 기존 모듈 현황

DB에 이미 존재하는 Freshdesk 모듈 (총 11개):

| ID | 한국어 명칭 | 슬러그 | 타입 |
|----|------------|--------|------|
| 1102326d-2a92-4f2a-9ba0-39dfe9d878c7 | 옴니채널 지원 | omnichannel | module |
| 28f2de88-2166-4211-a158-c74f86acedc4 | 티켓 관리 기초 | ticket-basics | module |
| 3a150645-ff73-4b99-a0e1-c170e898909b | 고객 만족(CSAT) 운영 | csat-ops | standalone |
| 58f15ef1-4d63-4812-af03-ace31f4bc7fe | 티켓 관리 고급 | ticket-advanced | standalone |
| 7d8d329c-384a-4040-bb88-f9cdb9e0682d | 자동화 및 워크플로우 | automation | module |
| 9368ac4b-5694-4b09-8dd3-af37540fea5d | 품질관리(QA) & 베스트 프랙티스 | qa-best-practices | standalone |
| 9dd2a299-7140-499b-98e3-18d0f7c0d913 | 리포팅 및 분석 | reporting | module |
| cb2ff21b-3c35-439f-b114-8c1ebcc3993b | 리포팅 고급 | reporting-advanced | standalone |
| d7e66065-04c3-4bab-bf09-bc6e1c7a9967 | 지식 베이스 고급 | knowledge-base-advanced | standalone |
| f4f36660-266e-453c-94e6-d8ecdbf5edea | 자동화 심화 | automation-advanced | standalone |
| fbd40b3d-ab2a-466d-a1f5-78cdec4b6545 | 지식 베이스 관리 | knowledge-base | module |

---

## 🔧 구체적인 작업 지침

### 질문 1에 대한 답변: **D안 (대체 방식)** 채택

```sql
-- Step 1: 기존 Freshdesk 모듈의 관련 데이터 삭제
-- (외래 키 순서 준수: 자식 → 부모)

-- 1-1. 기존 퀴즈 삭제
DELETE FROM quiz_questions 
WHERE module_id IN (
  SELECT id FROM curriculum_modules 
  WHERE target_product_id = 'freshdesk'
);

-- 1-2. 기존 섹션 콘텐츠 삭제
DELETE FROM module_contents 
WHERE module_id IN (
  SELECT id FROM curriculum_modules 
  WHERE target_product_id = 'freshdesk'
);

-- 1-3. 기존 모듈 삭제
DELETE FROM curriculum_modules 
WHERE target_product_id = 'freshdesk';

-- Step 2: 새로운 Phase 1 온보딩 4개 모듈 삽입
-- (CODING_AGENT_INSTRUCTIONS.md의 Step 4~6 실행)
```

### 작업 순서
1. ✅ **기존 데이터 백업** (롤백 대비)
   ```sql
   -- 백업 테이블 생성
   CREATE TABLE curriculum_modules_backup_20260104 AS 
   SELECT * FROM curriculum_modules WHERE target_product_id = 'freshdesk';
   
   CREATE TABLE module_contents_backup_20260104 AS 
   SELECT * FROM module_contents WHERE module_id IN (
     SELECT id FROM curriculum_modules WHERE target_product_id = 'freshdesk'
   );
   
   CREATE TABLE quiz_questions_backup_20260104 AS 
   SELECT * FROM quiz_questions WHERE module_id IN (
     SELECT id FROM curriculum_modules WHERE target_product_id = 'freshdesk'
   );
   ```

2. ✅ **기존 데이터 삭제** (위 DELETE 쿼리 실행)

3. ✅ **새 모듈 삽입** (JSON → DB 마이그레이션)
   - `target_product_id` = `'freshdesk'` 사용
   - 새로운 4개 모듈만 존재하게 됨

---

### 질문 2에 대한 답변: **B안 수정** 채택

현재 JSON 구조 분석 결과:
- **모듈 1~4 모두** `section_type: "knowledge-check"` 섹션 존재
- 각 섹션에 `quiz_questions` 배열 포함
- 모든 퀴즈를 DB에 삽입 가능

#### 작업 방법
```javascript
// 모든 모듈의 모든 섹션을 순회
for (const module of data.modules) {
  const moduleUUID = moduleIdMap.get(module.module_id);
  
  for (const section of module.sections) {
    // knowledge-check 섹션 찾기
    if (section.section_type === 'knowledge-check' && 
        section.quiz_questions && 
        section.quiz_questions.length > 0) {
      
      for (let i = 0; i < section.quiz_questions.length; i++) {
        const quiz = section.quiz_questions[i];
        
        // quiz_questions 테이블에 삽입
        await supabase.from('quiz_questions').insert({
          id: uuidv4(),
          module_id: moduleUUID,
          difficulty: section.level || 'basic',
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
      }
    }
  }
}
```

#### 예상 결과
- **모듈 1**: 3개 퀴즈 (기존 JSON 확인됨)
- **모듈 2**: 3개 퀴즈 (기존 JSON 확인됨)
- **모듈 3**: 3개 퀴즈 (JSON 내 knowledge-check 섹션 존재)
- **모듈 4**: 3개 퀴즈 (JSON 내 knowledge-check 섹션 존재)
- **총 퀴즈**: 약 12개

---

## 📝 최종 답변 요약

### 질문 1 답변
**D안: 기존 모듈 삭제 후 새 모듈로 완전 대체**
- `target_product_id = 'freshdesk'` 그대로 사용
- 기존 11개 모듈 → 삭제
- 새로운 4개 Phase 1 모듈 → 삽입
- UI에서는 오직 새 4개 모듈만 표시됨

### 질문 2 답변
**B안: 4개 모듈 모두 DB에 퀴즈 시드**
- JSON의 모든 `section_type: "knowledge-check"` 섹션에서 퀴즈 추출
- `quiz_questions` 테이블에 모두 삽입
- 총 12개 퀴즈 예상 (모듈당 3개)

---

## ⚠️ 추가 주의사항

### 1. 프론트엔드 영향도
- 기존 모듈을 참조하는 사용자 진행 상태 데이터가 있을 수 있음
- 삭제 전 `user_progress`, `user_quiz_attempts` 등 관련 테이블 확인 필요

### 2. 단계적 롤아웃 고려
만약 기존 사용자 데이터 유지가 필요하다면:
```sql
-- 대안: 기존 모듈을 비활성화만 하고 보존
UPDATE curriculum_modules 
SET is_active = false 
WHERE target_product_id = 'freshdesk';

-- 새 모듈은 활성 상태로 삽입
-- (is_active = true)
```

### 3. 검증 쿼리 추가
```sql
-- 대체 후 확인: Freshdesk 모듈이 정확히 4개인지
SELECT COUNT(*) as module_count 
FROM curriculum_modules 
WHERE target_product_id = 'freshdesk' 
  AND is_active = true;
-- 예상 결과: 4

-- 각 모듈의 섹션 수 확인
SELECT 
  cm.name_ko,
  cm.display_order,
  COUNT(mc.id) as section_count
FROM curriculum_modules cm
LEFT JOIN module_contents mc ON cm.id = mc.module_id
WHERE cm.target_product_id = 'freshdesk' 
  AND cm.is_active = true
GROUP BY cm.id, cm.name_ko, cm.display_order
ORDER BY cm.display_order;

-- 각 모듈의 퀴즈 수 확인
SELECT 
  cm.name_ko,
  COUNT(qq.id) as quiz_count
FROM curriculum_modules cm
LEFT JOIN quiz_questions qq ON cm.id = qq.module_id
WHERE cm.target_product_id = 'freshdesk' 
  AND cm.is_active = true
GROUP BY cm.id, cm.name_ko
ORDER BY cm.display_order;
-- 예상 결과: 각 모듈당 3개씩, 총 12개
```

---

## 🎯 실행 체크리스트

### Before 작업
- [ ] 기존 데이터 백업 완료
- [ ] 사용자 진행 상태 테이블 확인
- [ ] 롤백 계획 수립

### During 작업
- [ ] Step 1: 기존 퀴즈 삭제
- [ ] Step 2: 기존 섹션 삭제
- [ ] Step 3: 기존 모듈 삭제
- [ ] Step 4: 새 모듈 4개 삽입
- [ ] Step 5: 새 섹션 약 26~30개 삽입
- [ ] Step 6: 새 퀴즈 12개 삽입

### After 작업
- [ ] 모듈 수 검증 (4개 확인)
- [ ] 섹션 수 검증
- [ ] 퀴즈 수 검증 (12개 확인)
- [ ] 외래 키 무결성 확인
- [ ] 프론트엔드 UI 테스트

---

## 📞 추가 확인 필요 사항

혹시 다음 사항이 걱정된다면 추가 논의 필요:

1. **기존 학습 진행 데이터 마이그레이션**
   - 기존 모듈로 학습 중인 사용자가 있는가?
   - 진행 상태를 새 모듈로 매핑할 필요가 있는가?

2. **점진적 전환 (Gradual Rollout)**
   - 모든 사용자에게 즉시 적용 vs 단계적 공개
   - Feature flag를 통한 A/B 테스트 고려

3. **교육 자료 업데이트**
   - 기존 Freshdesk 교육 문서/가이드 수정 필요
   - 내부 팀 교육 일정 조율

---

**작성일**: 2026-01-04  
**작성자**: 프로덕트 어시스트 AI  
**참조**: CODING_AGENT_INSTRUCTIONS.md, freshdesk_phase1_onboarding_COMPLETE.json

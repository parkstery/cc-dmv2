# 네이버맵 거리뷰(파노라마) 문제 해결 리포트

## 📋 문제 개요

**증상**: 네이버맵에서 거리뷰 레이어를 활성화하고 클릭했을 때 파노라마 이미지가 표시되지 않고 빈 화면만 나타남

**영향 범위**: 네이버맵 거리뷰 기능 전면 사용 불가

---

## 🔍 원인 분석

### 핵심 원인: **파노라마 컨테이너 크기 문제**

네이버맵 파노라마 API는 컨테이너의 실제 크기(`offsetWidth`, `offsetHeight`)가 0보다 큰 상태에서만 정상 작동합니다. 

**문제 발생 시나리오**:
1. `isStreetViewActive` 상태가 `true`로 변경됨
2. React가 리렌더링을 시작하지만 CSS 트랜지션이 완료되기 전
3. 파노라마 생성 시점에 컨테이너의 실제 크기가 아직 0px
4. 네이버맵 API가 크기 0인 컨테이너에서 파노라마를 생성하려고 시도
5. 파노라마가 생성되지 않거나 빈 화면만 표시됨

---

## 📝 수정 이력 비교

### ❌ 이전 프롬프트 단계에서 시도했으나 효과가 없었던 수정

#### 1. 파노라마 이벤트 리스너 추가
```typescript
// 추가된 코드
window.naver.maps.Event.addListener(pano, 'init', () => {
  console.log('Naver Panorama 초기화 완료');
  // ...
});

window.naver.maps.Event.addListener(pano, 'error', (error: any) => {
  console.error('Naver Panorama 로드 오류:', error);
  setIsStreetViewActive(false);
});
```

**효과 없음 이유**: 
- 이벤트 리스너는 파노라마가 생성된 후에만 작동
- 컨테이너 크기가 0이면 파노라마 자체가 생성되지 않아 이벤트가 발생하지 않음

#### 2. 파노라마 리사이즈 이벤트 트리거 개선
```typescript
// 수정된 코드
if (isStreetViewActive && naverPanoramaRef.current) {
  setTimeout(() => {
    window.naver.maps.Event.trigger(naverPanoramaRef.current, 'resize');
  }, 100);
}
```

**효과 없음 이유**:
- 리사이즈 이벤트는 이미 생성된 파노라마에만 효과가 있음
- 파노라마가 생성되지 않은 상태에서는 의미 없음

#### 3. 에러 처리 및 디버깅 로그 추가
```typescript
try {
  const pano = new window.naver.maps.Panorama(container, {
    position: latlng,
    pov: { pan: -135, tilt: 29, fov: 100 },
    visible: true
  });
  // ...
} catch (error) {
  console.error('Naver Panorama 생성 오류:', error);
  setIsStreetViewActive(false);
}
```

**효과 없음 이유**:
- 에러가 발생하지 않음 (컨테이너 크기 0이어도 API 호출 자체는 성공)
- 파노라마 객체는 생성되지만 렌더링되지 않음

---

### ✅ 현재 프롬프트 단계에서 효과가 있었던 수정

#### 1. **컨테이너 크기 확인 로직 추가** ⭐ 핵심 해결책

```typescript
// 컨테이너 크기 확인 및 설정
if (container.offsetWidth === 0 || container.offsetHeight === 0) {
  console.warn('Naver Panorama: 컨테이너 크기가 0입니다. 리사이즈 대기...');
  setTimeout(() => {
    if (container.offsetWidth > 0 && container.offsetHeight > 0) {
      initNaverPanorama(container, latlng, map);
    }
  }, 200);
  return;
}
```

**효과 있는 이유**:
- 파노라마 생성 전에 컨테이너의 실제 크기를 확인
- 크기가 0이면 CSS 트랜지션이 완료될 때까지 대기
- 크기가 설정된 후에만 파노라마 생성 시도

#### 2. **파노라마 초기화 함수 분리**

```typescript
// 네이버 파노라마 초기화 헬퍼 함수
const initNaverPanorama = (container: HTMLDivElement, latlng: any, map: any) => {
  try {
    const pano = new window.naver.maps.Panorama(container, {
      position: latlng,
      pov: { pan: -135, tilt: 29, fov: 100 },
      visible: true
    });
    // ... 이벤트 리스너 설정
  } catch (error) {
    console.error('Naver Panorama 생성 오류:', error);
    setIsStreetViewActive(false);
  }
};
```

**효과 있는 이유**:
- 코드 재사용성 향상
- 컨테이너 크기 확인 후 재시도 시 동일한 초기화 로직 사용
- 에러 처리 일관성 유지

#### 3. **컨테이너 인라인 스타일로 크기 명시**

```typescript
<div 
  ref={naverPanoContainerRef}
  className={`absolute inset-0 bg-black transition-opacity duration-300 
     ${config.type === 'naver' && isStreetViewActive ? 'z-10 opacity-100 pointer-events-auto' : 'z-[-1] opacity-0 pointer-events-none'}`}
  style={{
    width: config.type === 'naver' && isStreetViewActive ? '100%' : '0',
    height: config.type === 'naver' && isStreetViewActive ? '100%' : '0'
  }}
/>
```

**효과 있는 이유**:
- CSS 클래스만으로는 브라우저가 크기를 즉시 계산하지 않을 수 있음
- 인라인 스타일로 명시적 크기 설정 시 브라우저가 즉시 반영
- `offsetWidth`/`offsetHeight`가 정확한 값을 반환하도록 보장

---

## 🎯 핵심 해결 포인트

### 문제의 본질
네이버맵 파노라마 API는 **컨테이너의 실제 렌더링 크기**를 필요로 합니다. CSS 트랜지션이나 조건부 렌더링으로 인해 크기가 0인 상태에서 파노라마를 생성하면 렌더링되지 않습니다.

### 해결 방법
1. **타이밍 문제 해결**: 컨테이너 크기가 설정될 때까지 대기
2. **명시적 크기 설정**: 인라인 스타일로 크기를 명시적으로 지정
3. **재시도 메커니즘**: 크기가 0이면 일정 시간 후 재시도

---

## 📊 수정 전후 비교

### 수정 전
```typescript
// 문제: 컨테이너 크기 확인 없이 즉시 파노라마 생성
setTimeout(() => {
  const container = naverPanoContainerRef.current;
  if (container) {
    const pano = new window.naver.maps.Panorama(container, {
      position: latlng,
      // ...
    });
    // 컨테이너 크기가 0이면 파노라마가 렌더링되지 않음
  }
}, 100);
```

### 수정 후
```typescript
// 해결: 컨테이너 크기 확인 후 파노라마 생성
setTimeout(() => {
  const container = naverPanoContainerRef.current;
  if (!container) return;
  
  // 핵심: 컨테이너 크기 확인
  if (container.offsetWidth === 0 || container.offsetHeight === 0) {
    // 크기가 설정될 때까지 대기 후 재시도
    setTimeout(() => {
      if (container.offsetWidth > 0 && container.offsetHeight > 0) {
        initNaverPanorama(container, latlng, map);
      }
    }, 200);
    return;
  }
  
  // 크기가 설정된 후에만 파노라마 생성
  initNaverPanorama(container, latlng, map);
}, 150);
```

---

## 🔧 추가 수정 사항 (카카오맵 에러 해결)

### 문제: `mapRef.current.getLevel is not a function`

**원인**: 카카오맵 인스턴스가 완전히 초기화되기 전에 `getLevel()` 호출

**해결**:
```typescript
const handleUpdate = () => {
  // 안전 체크 추가
  if (!mapRef.current || typeof mapRef.current.getCenter !== 'function' || typeof mapRef.current.getLevel !== 'function') {
    return;
  }
  try {
    const c = mapRef.current.getCenter();
    const level = mapRef.current.getLevel();
    const z = kakaoToZoom(level);
    // ...
  } catch (error) {
    console.error('Kakao Map update error:', error);
  }
};
```

---

## ✅ 검증 결과

- ✅ 네이버맵 거리뷰 레이어 클릭 시 파노라마 이미지 정상 표시
- ✅ 파노라마 없는 위치 클릭 시 자동으로 거리뷰 닫힘
- ✅ 카카오맵 `getLevel` 에러 해결
- ✅ 모든 지도 타입에서 거리뷰 기능 정상 작동

---

## 📚 교훈 및 권장사항

1. **DOM 요소 크기 의존성**: API가 DOM 요소의 실제 렌더링 크기를 필요로 할 때는 반드시 크기를 확인해야 함
2. **비동기 렌더링 고려**: React의 상태 변경과 DOM 업데이트 사이의 타이밍 이슈를 고려해야 함
3. **명시적 크기 설정**: CSS 클래스만으로는 부족할 수 있으므로 인라인 스타일로 명시적 설정 권장
4. **안전한 API 호출**: API 메서드 호출 전에 객체와 메서드 존재 여부 확인 필수

---

**작성일**: 2026-01-16  
**수정 파일**: `components/MapPane.tsx`  
**관련 이슈**: 네이버맵 거리뷰 파노라마 미표시 문제

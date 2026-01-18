# FileUpload 컴포넌트 사용 가이드

## 개요
`FileUpload` 컴포넌트는 파일 선택과 드래그 앤 드롭 업로드를 지원하는 재사용 가능한 컴포넌트입니다.

## 기본 사용법

```tsx
import FileUpload from './components/FileUpload';

function MyComponent() {
  const handleFileSelect = (files: File[]) => {
    console.log('선택된 파일:', files);
    // 파일 처리 로직
  };

  return (
    <FileUpload
      onFileSelect={handleFileSelect}
      accept=".pdf,.doc,.docx"
      multiple={true}
      maxSize={10 * 1024 * 1024} // 10MB
    />
  );
}
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `onFileSelect` | `(files: File[]) => void` | **필수** | 파일 선택 시 호출되는 콜백 함수 |
| `accept` | `string` | `undefined` | 허용할 파일 형식 (예: ".pdf,.doc" 또는 "image/*") |
| `multiple` | `boolean` | `false` | 다중 파일 선택 허용 여부 |
| `maxSize` | `number` | `undefined` | 최대 파일 크기 (bytes) |
| `className` | `string` | `''` | 추가 CSS 클래스 |
| `disabled` | `boolean` | `false` | 비활성화 여부 |
| `children` | `React.ReactNode` | `undefined` | 커스텀 UI (기본 UI 대신 사용) |

## 기능

### ✅ 드래그 앤 드롭 지원
- 파일을 드래그하여 컴포넌트 영역에 놓으면 자동으로 선택됩니다
- 드래그 중 시각적 피드백 제공 (파란색 테두리)

### ✅ 파일 검증
- 파일 크기 검증 (maxSize 설정 시)
- 파일 형식 검증 (accept 설정 시)
- 검증 실패 시 에러 메시지 표시

### ✅ 다중 파일 지원
- `multiple={true}` 설정 시 여러 파일 동시 선택 가능

### ✅ 커스텀 UI
- `children` prop으로 커스텀 UI 제공 가능

## 사용 예제

### 예제 1: 이미지 업로드
```tsx
<FileUpload
  onFileSelect={(files) => {
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        // 이미지 미리보기 처리
        console.log(e.target?.result);
      };
      reader.readAsDataURL(file);
    });
  }}
  accept="image/*"
  multiple={true}
  maxSize={5 * 1024 * 1024} // 5MB
/>
```

### 예제 2: 단일 PDF 파일 업로드
```tsx
<FileUpload
  onFileSelect={(files) => {
    if (files.length > 0) {
      const file = files[0];
      // PDF 처리 로직
      console.log('PDF 파일:', file);
    }
  }}
  accept=".pdf"
  multiple={false}
  maxSize={10 * 1024 * 1024} // 10MB
/>
```

### 예제 3: 커스텀 UI
```tsx
<FileUpload
  onFileSelect={handleFileSelect}
  accept=".csv,.xlsx"
>
  <div className="p-4 border-2 border-dashed border-gray-300 rounded">
    <p className="text-center">CSV 또는 Excel 파일을 업로드하세요</p>
  </div>
</FileUpload>
```

### 예제 4: 버튼 스타일
```tsx
<FileUpload
  onFileSelect={handleFileSelect}
  className="inline-block"
>
  <button className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
    파일 선택
  </button>
</FileUpload>
```

## 주의사항

1. **파일 크기 제한**: `maxSize`는 bytes 단위입니다. MB로 변환하려면 `1024 * 1024`를 곱하세요.
2. **파일 형식**: `accept` prop은 HTML5 input의 accept 속성과 동일한 형식을 사용합니다.
3. **에러 처리**: 검증 실패 시 에러 메시지가 5초간 표시됩니다.
4. **브라우저 호환성**: 모든 모던 브라우저에서 작동합니다.

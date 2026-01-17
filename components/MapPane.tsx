import React, { useEffect, useRef, useState, useCallback } from 'react';
import { MapVendor, MapState, PaneConfig, GISMode } from '../types';
import KakaoGisToolbar from './KakaoGisToolbar';

interface MapPaneProps {
  side: 'left' | 'right';
  config: PaneConfig;
  globalState: MapState;
  onStateChange: (state: MapState) => void;
  searchPos: { lat: number, lng: number } | null;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  streetViewState: { lat: number, lng: number, active: boolean } | null;
  onStreetViewChange: (state: { lat: number, lng: number, active: boolean } | null) => void;
}

const MapPane: React.FC<MapPaneProps> = ({ 
  side, config, globalState, onStateChange, searchPos, 
  isFullscreen, onToggleFullscreen, streetViewState, onStreetViewChange
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  
  // -- Sync Control Refs --
  const isDragging = useRef(false); 
  const isProgrammaticUpdate = useRef(false);

  const [sdkLoaded, setSdkLoaded] = useState(false); 
  
  // -- Street View / Road View States --
  const [isStreetViewActive, setIsStreetViewActive] = useState(false);

  // Google Refs
  const googlePanoRef = useRef<HTMLDivElement>(null);
  const googlePanoInstanceRef = useRef<any>(null);
  const googleCoverageLayerRef = useRef<any>(null);

  // Naver Refs
  const naverStreetLayerRef = useRef<any>(null);
  const naverPanoramaRef = useRef<any>(null);
  const naverPanoContainerRef = useRef<HTMLDivElement>(null);
  const naverMarkerRef = useRef<any>(null); // Marker on Mini-map
  const [isNaverLayerOn, setIsNaverLayerOn] = useState(false);
  
  // Kakao Refs & Drawing State
  const kakaoGisRef = useRef<{
    rv: any;
    rvClient: any;
    geocoder: any;
    walker: any;
    roadviewLayer: boolean;
    clickHandler?: any; 
    addressClickListener?: any;
    walkerOverlay?: any; // Walker on Mini-map
  }>({
    rv: null,
    rvClient: null,
    geocoder: null,
    walker: null,
    roadviewLayer: false
  });
  
  // Kakao Drawing Refs for Measurement
  const kakaoDrawingRef = useRef<{
    polylines: any[];
    polygons: any[];
    overlays: any[];
    listeners: (() => void)[];
  }>({
    polylines: [], polygons: [], overlays: [], listeners: []
  });

  const [gisMode, setGisMode] = useState<GISMode>(GISMode.DEFAULT);
  const roadviewRef = useRef<HTMLDivElement>(null);

  // Helper: Zoom conversion
  const zoomToKakao = (z: number) => Math.max(1, Math.min(14, 20 - z));
  const kakaoToZoom = (l: number) => Math.max(3, Math.min(20, 20 - l));

  // 1. SDK Loading Check & Init
  useEffect(() => {
    let intervalId: any = null;
    const checkAndInit = () => {
      // 1. Google
      if (config.type === 'google' && window.google && window.google.maps) {
        if (containerRef.current) containerRef.current.innerHTML = '';
        initGoogleMap();
        return true;
      }
      // 2. Kakao - autoload=false이므로 window.kakao와 maps.load() 체크
      if (config.type === 'kakao' && window.kakao) {
        try {
          // window.kakao.maps.load가 준비되었는지 확인
          if (window.kakao.maps && typeof window.kakao.maps.load === 'function') {
            window.kakao.maps.load(() => {
              if (containerRef.current) {
                containerRef.current.innerHTML = '';
                initKakaoMap();
                setSdkLoaded(true);
              }
            });
            return true;
          }
          // maps.load가 아직 준비되지 않았으면 false 반환하여 재시도
          return false;
        } catch (error) {
          console.error('Kakao Maps SDK 로딩 오류:', error);
          return false;
        }
      }
      // 3. Naver
      if (config.type === 'naver' && window.naver && window.naver.maps) {
        if (containerRef.current) containerRef.current.innerHTML = '';
        initNaverMap();
        return true;
      }
      return false;
    };

    if (!checkAndInit()) {
      intervalId = setInterval(() => {
        if (checkAndInit()) {
          clearInterval(intervalId);
          // Kakao의 경우 load() 콜백에서 setSdkLoaded를 호출하므로 여기서는 호출하지 않음
          if (config.type !== 'kakao') {
            setSdkLoaded(true);
          }
        }
      }, 300);
    } else {
      // Kakao의 경우 load() 콜백에서 setSdkLoaded를 호출하므로 여기서는 호출하지 않음
      if (config.type !== 'kakao') {
        setSdkLoaded(true);
      }
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.type]);

  // ** Reset Refs on Config Change **
  useEffect(() => {
    isDragging.current = false;
    isProgrammaticUpdate.current = false;
    setIsNaverLayerOn(false); 
    setGisMode(GISMode.DEFAULT);
    setIsStreetViewActive(false);
    
    // Clear Naver Resources
    if (config.type !== 'naver') {
        if (naverPanoramaRef.current) naverPanoramaRef.current = null;
        if (naverMarkerRef.current) { naverMarkerRef.current.setMap(null); naverMarkerRef.current = null; }
        if (naverPanoContainerRef.current) naverPanoContainerRef.current.innerHTML = '';
        if (naverStreetLayerRef.current) naverStreetLayerRef.current = null;
    }
    // Clear Google Resources
    if (config.type !== 'google') {
       if (googleCoverageLayerRef.current) googleCoverageLayerRef.current.setMap(null);
    }
    // Clear Kakao Resources
    if (config.type !== 'kakao') {
      clearKakaoDrawingResources();
      if (kakaoGisRef.current.walkerOverlay) {
          kakaoGisRef.current.walkerOverlay.setMap(null);
          kakaoGisRef.current.walkerOverlay = null;
      }
    }
  }, [config.type]);


  // -- Resize & Refresh Handler --
  useEffect(() => {
    if (!mapRef.current) return;
    
    const timer = setTimeout(() => {
      try {
        if (config.type === 'google') {
          window.google.maps.event.trigger(mapRef.current, 'resize');
          mapRef.current.setCenter({ lat: globalState.lat, lng: globalState.lng });
        } else if (config.type === 'kakao') {
          // 카카오맵 리사이즈 처리 (미니맵 전환 시 중요)
          mapRef.current.relayout();
          mapRef.current.setCenter(new window.kakao.maps.LatLng(globalState.lat, globalState.lng));
          
          // 거리뷰 활성화 시 Walker 재표시
          if (isStreetViewActive && kakaoGisRef.current.walkerOverlay) {
            setTimeout(() => {
              if (kakaoGisRef.current.walkerOverlay && mapRef.current) {
                kakaoGisRef.current.walkerOverlay.setMap(null);
                kakaoGisRef.current.walkerOverlay.setMap(mapRef.current);
              }
            }, 100);
          }
        } else if (config.type === 'naver') {
          window.naver.maps.Event.trigger(mapRef.current, 'resize');
          mapRef.current.setCenter(new window.naver.maps.LatLng(globalState.lat, globalState.lng));
          
          // 네이버 파노라마 리사이즈 처리
          if (isStreetViewActive && naverPanoramaRef.current) {
            setTimeout(() => {
              if (naverPanoramaRef.current) {
                window.naver.maps.Event.trigger(naverPanoramaRef.current, 'resize');
              }
            }, 100);
          }
        }
      } catch(e) { console.error(e); }
    }, 350); 
    
    return () => clearTimeout(timer);
  }, [isStreetViewActive, config.type, globalState.lat, globalState.lng]);


  // 2. Initialize Maps
  const initGoogleMap = () => {
    if (!containerRef.current || !googlePanoRef.current) return;
    
    const panorama = new window.google.maps.StreetViewPanorama(googlePanoRef.current, {
       visible: false,
       enableCloseButton: false,
    });
    googlePanoInstanceRef.current = panorama;
    googleCoverageLayerRef.current = new window.google.maps.StreetViewCoverageLayer();

    mapRef.current = new window.google.maps.Map(containerRef.current, {
      center: { lat: globalState.lat, lng: globalState.lng },
      zoom: globalState.zoom,
      mapTypeId: config.isSatellite ? 'satellite' : 'roadmap',
      disableDefaultUI: false,
      zoomControl: true,
      streetViewControl: true,
      streetViewControlOptions: {
        position: window.google.maps.ControlPosition.TOP_RIGHT
      },
      fullscreenControl: false,
      streetView: panorama,
      gestureHandling: 'greedy'
    });
    
    setupMapListeners('google');

    panorama.addListener('visible_changed', () => {
      const isVisible = panorama.getVisible();
      setIsStreetViewActive(isVisible);
      if (isVisible) {
        googleCoverageLayerRef.current.setMap(mapRef.current);
        // 거리뷰 시작 시 초기 위치를 미니맵 중앙으로 이동
        const pos = panorama.getPosition();
        if (pos) {
          const lat = pos.lat();
          const lng = pos.lng();
          mapRef.current.setCenter({ lat, lng });
          onStateChange({ lat, lng, zoom: mapRef.current.getZoom() });
          
          // 거리뷰 상태 업데이트 (동기화를 위해)
          onStreetViewChange({ lat, lng, active: true });
        }
      } else {
        googleCoverageLayerRef.current.setMap(null);
        // 거리뷰 닫을 때 상태 업데이트
        onStreetViewChange(null);
      }
    });

    panorama.addListener('position_changed', () => {
      if (panorama.getVisible()) {
        const pos = panorama.getPosition();
        if (pos) {
          const lat = pos.lat();
          const lng = pos.lng();
          isDragging.current = true; 
          
          // 거리뷰 상태 업데이트 (동기화를 위해)
          onStreetViewChange({ lat, lng, active: true });
          
          // 미니맵 중앙으로 이동
          mapRef.current.setCenter({ lat, lng });
          onStateChange({ lat, lng, zoom: mapRef.current.getZoom() });
          
          setTimeout(() => isDragging.current = false, 200);
        }
      }
    });
  };

  const initKakaoMap = () => {
    if (!containerRef.current) {
      console.error('Kakao Map: containerRef가 없습니다');
      return;
    }
    
    try {
      if (!window.kakao || !window.kakao.maps) {
        console.error('Kakao Maps SDK가 로드되지 않았습니다');
        return;
      }

      const options = {
        center: new window.kakao.maps.LatLng(globalState.lat, globalState.lng),
        level: zoomToKakao(globalState.zoom)
      };
      mapRef.current = new window.kakao.maps.Map(containerRef.current, options);
      
      if (config.isSatellite) {
        mapRef.current.setMapTypeId(window.kakao.maps.MapTypeId.HYBRID);
      }
      
      if (window.kakao.maps.services) {
        kakaoGisRef.current.geocoder = new window.kakao.maps.services.Geocoder();
      }
      kakaoGisRef.current.rvClient = new window.kakao.maps.RoadviewClient();
      
      setupMapListeners('kakao');
      setupKakaoAddressClick();
      
      console.log('Kakao Map 초기화 완료');
    } catch (error) {
      console.error('Kakao Map 초기화 오류:', error);
    }
  };

  const initNaverMap = () => {
    if (!containerRef.current) return;
    mapRef.current = new window.naver.maps.Map(containerRef.current, {
      center: new window.naver.maps.LatLng(globalState.lat, globalState.lng),
      zoom: globalState.zoom,
      mapTypeId: config.isSatellite ? window.naver.maps.MapTypeId.SATELLITE : window.naver.maps.MapTypeId.NORMAL
    });
    
    naverStreetLayerRef.current = new window.naver.maps.StreetLayer();
    setupMapListeners('naver');
  };

  // 카카오맵 Walker 생성 헬퍼 함수 (카카오맵 공식 walker 사용, 방향 동기화)
  const createKakaoWalker = useCallback((pos: any, map: any, angle?: number) => {
    // 기존 Walker가 있으면 제거
    if (kakaoGisRef.current.walkerOverlay) {
      kakaoGisRef.current.walkerOverlay.setMap(null);
      kakaoGisRef.current.walkerOverlay = null;
    }
    
    // 카카오맵 공식 walker 이미지 사용
    const img = new Image();
    img.onload = () => {
      const content = document.createElement('div');
      content.style.width = '26px';
      content.style.height = '46px';
      content.style.background = 'url(https://t1.daumcdn.net/localimg/localimages/07/mapapidoc/walker.png) no-repeat 0 0';
      content.style.backgroundSize = '26px 46px';
      content.style.backgroundPosition = 'center';
      content.style.backgroundRepeat = 'no-repeat';
      content.style.transformOrigin = 'center bottom'; // 회전 중심을 하단 중앙으로 설정
      if (angle !== undefined) {
        content.style.transform = `rotate(${angle}deg)`;
      }
      
      kakaoGisRef.current.walkerOverlay = new window.kakao.maps.CustomOverlay({
        position: pos,
        content: content,
        map: map,
        yAnchor: 1, // 하단 기준으로 앵커 설정
        zIndex: 1000
      });
      
      // 지도 리사이즈 후 Walker 재표시 보장
      setTimeout(() => {
        if (kakaoGisRef.current.walkerOverlay && map) {
          kakaoGisRef.current.walkerOverlay.setMap(null);
          kakaoGisRef.current.walkerOverlay.setMap(map);
        }
      }, 150);
    };
    
    img.onerror = () => {
      console.error('Walker 이미지 로딩 실패');
      // 이미지 로딩 실패 시 삼각형 마커 생성 (네이버맵과 동일한 형태)
      const size = 24;
      const svg = `
        <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
          <path d="M12,2 L22,20 L2,20 Z" fill="#FF3333" stroke="#FFFFFF" stroke-width="2"/>
        </svg>
      `;
      const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);
      
      const content = document.createElement('div');
      content.style.width = `${size}px`;
      content.style.height = `${size}px`;
      content.style.backgroundImage = `url(${url})`;
      content.style.backgroundSize = 'contain';
      content.style.backgroundPosition = 'center';
      content.style.backgroundRepeat = 'no-repeat';
      content.style.transformOrigin = 'center bottom'; // 회전 중심을 하단 중앙으로 설정
      if (angle !== undefined) {
        content.style.transform = `rotate(${angle}deg)`;
      }
      
      kakaoGisRef.current.walkerOverlay = new window.kakao.maps.CustomOverlay({
        position: pos,
        content: content,
        map: map,
        yAnchor: 1, // 하단 기준으로 앵커 설정
        zIndex: 1000
      });
    };
    
    img.src = 'https://t1.daumcdn.net/localimg/localimages/07/mapapidoc/walker.png';
  }, []);

  // 네이버맵 삼각형 마커 생성 헬퍼 함수
  const createNaverTriangleMarker = useCallback((angle: number = 0) => {
    // SVG로 삼각형 마커 생성 (빨간색 삼각형, 방향 표시)
    const size = 24;
    const svg = `
      <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
        <path d="M12,2 L22,20 L2,20 Z" fill="#FF3333" stroke="#FFFFFF" stroke-width="2"/>
      </svg>
    `;
    const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    
    return {
      url: url,
      size: new window.naver.maps.Size(size, size),
      anchor: new window.naver.maps.Point(size / 2, size / 2),
      scaledSize: new window.naver.maps.Size(size, size)
    };
  }, []);

  const initNaverPanorama = (container: HTMLDivElement, latlng: any, map: any) => {
    try {
      // 컨테이너 스타일 확인 및 조정 (전체 영역 채우기 보장)
      if (container) {
        container.style.position = 'absolute';
        container.style.top = '0';
        container.style.left = '0';
        container.style.right = '0';
        container.style.bottom = '0';
        container.style.width = '100%';
        container.style.height = '100%';
        container.style.margin = '0';
        container.style.padding = '0';
        container.style.boxSizing = 'border-box';
      }
      
      const pano = new window.naver.maps.Panorama(container, {
        position: latlng,
        pov: { pan: -135, tilt: 29, fov: 100 },
        visible: true
      });
      naverPanoramaRef.current = pano;

      // 파노라마 로드 완료 이벤트
      window.naver.maps.Event.addListener(pano, 'init', () => {
        console.log('Naver Panorama 초기화 완료');
        // 파노라마가 실제로 로드된 위치로 마커 업데이트
        const actualPos = pano.getPosition();
        if (naverMarkerRef.current) {
          naverMarkerRef.current.setPosition(actualPos);
        }
        if (mapRef.current) {
          mapRef.current.setCenter(actualPos);
        }
        // 파노라마 초기화 후 리사이즈 이벤트 트리거 (렌더링 보장)
        // 컨테이너 크기가 확실히 설정된 후 리사이즈
        setTimeout(() => {
          if (container && container.offsetWidth > 0 && container.offsetHeight > 0) {
            window.naver.maps.Event.trigger(pano, 'resize');
            // 추가로 한 번 더 리사이즈 (렌더링 보장)
            setTimeout(() => {
              window.naver.maps.Event.trigger(pano, 'resize');
            }, 50);
          }
        }, 150);
      });

      // 파노라마 로드 실패 이벤트
      window.naver.maps.Event.addListener(pano, 'error', (error: any) => {
        console.error('Naver Panorama 로드 오류:', error);
        // 파노라마가 없는 위치일 수 있으므로 거리뷰 닫기
        setIsStreetViewActive(false);
      });

      // Sync Map & Marker when Panorama moves - 미니맵 중앙으로 이동
      window.naver.maps.Event.addListener(pano, 'position_changed', () => {
        const pos = pano.getPosition();
        const lat = pos.lat();
        const lng = pos.lng();
        const pov = pano.getPov();
        const angle = pov ? pov.pan : 0;
        
        // 거리뷰 상태 업데이트 (동기화를 위해)
        onStreetViewChange({ lat, lng, active: true });
        
        // Sync Map Center - 미니맵 중앙으로 이동
        if (mapRef.current) {
          mapRef.current.setCenter(pos);
        }
        // Sync Marker - 미니맵 중앙에 위치 (삼각형 마커, 방향 표시)
        if (naverMarkerRef.current) {
          naverMarkerRef.current.setPosition(pos);
          naverMarkerRef.current.setIcon(createNaverTriangleMarker(angle));
          if (typeof naverMarkerRef.current.setAngle === 'function') {
            naverMarkerRef.current.setAngle(angle);
          }
        } else {
          // 마커가 없으면 생성 (삼각형 마커)
          const icon = createNaverTriangleMarker(angle);
          naverMarkerRef.current = new window.naver.maps.Marker({
            position: pos,
            map: mapRef.current,
            icon: icon,
            angle: angle
          });
        }
      });

      // 파노라마 시점 변경 이벤트 (방향 업데이트)
      window.naver.maps.Event.addListener(pano, 'pov_changed', () => {
        const pov = pano.getPov();
        const angle = pov ? pov.pan : 0;
        if (naverMarkerRef.current) {
          naverMarkerRef.current.setIcon(createNaverTriangleMarker(angle));
          if (typeof naverMarkerRef.current.setAngle === 'function') {
            naverMarkerRef.current.setAngle(angle);
          }
        }
      });
    } catch (error) {
      console.error('Naver Panorama 생성 오류:', error);
      setIsStreetViewActive(false);
    }
  };

  // 3. Common Map Listeners
  const setupMapListeners = (type: MapVendor) => {
    if (!mapRef.current) return;

    const shouldUpdate = (newLat: number, newLng: number, newZoom: number) => {
        if (isProgrammaticUpdate.current) return false;
        const latDiff = Math.abs(newLat - globalState.lat);
        const lngDiff = Math.abs(newLng - globalState.lng);
        if (latDiff < 0.00001 && lngDiff < 0.00001 && newZoom === globalState.zoom) {
            return false;
        }
        return true;
    };

    if (type === 'google') {
      mapRef.current.addListener('dragstart', () => { isDragging.current = true; });
      mapRef.current.addListener('dragend', () => { isDragging.current = false; });
      const handleUpdate = () => {
        const c = mapRef.current.getCenter();
        const z = mapRef.current.getZoom();
        if (shouldUpdate(c.lat(), c.lng(), z)) {
            onStateChange({ lat: c.lat(), lng: c.lng(), zoom: z });
        }
      };
      mapRef.current.addListener('center_changed', handleUpdate);
      mapRef.current.addListener('zoom_changed', handleUpdate);

    } else if (type === 'kakao') {
      window.kakao.maps.event.addListener(mapRef.current, 'dragstart', () => { isDragging.current = true; });
      window.kakao.maps.event.addListener(mapRef.current, 'dragend', () => { isDragging.current = false; });
      const handleUpdate = () => {
        if (!mapRef.current || typeof mapRef.current.getCenter !== 'function' || typeof mapRef.current.getLevel !== 'function') {
          return;
        }
        try {
          const c = mapRef.current.getCenter();
          const level = mapRef.current.getLevel();
          const z = kakaoToZoom(level);
          if (shouldUpdate(c.getLat(), c.getLng(), z)) {
              onStateChange({ lat: c.getLat(), lng: c.getLng(), zoom: z });
          }
        } catch (error) {
          console.error('Kakao Map update error:', error);
        }
      };
      window.kakao.maps.event.addListener(mapRef.current, 'center_changed', handleUpdate);
      window.kakao.maps.event.addListener(mapRef.current, 'zoom_changed', handleUpdate);

    } else if (type === 'naver') {
      window.naver.maps.Event.addListener(mapRef.current, 'dragstart', () => { isDragging.current = true; });
      window.naver.maps.Event.addListener(mapRef.current, 'dragend', () => { isDragging.current = false; });
      const handleUpdate = () => {
        if (isProgrammaticUpdate.current) return;
        const c = mapRef.current.getCenter();
        const z = mapRef.current.getZoom();
        if (shouldUpdate(c.lat(), c.lng(), z)) {
            onStateChange({ lat: c.lat(), lng: c.lng(), zoom: z });
        }
      };
      window.naver.maps.Event.addListener(mapRef.current, 'center_changed', handleUpdate);
      window.naver.maps.Event.addListener(mapRef.current, 'zoom_changed', handleUpdate);
    }
  };

  // CHANGE: Right click -> Left click for Address
  const setupKakaoAddressClick = () => {
    if (kakaoGisRef.current.addressClickListener) {
        window.kakao.maps.event.removeListener(mapRef.current, 'click', kakaoGisRef.current.addressClickListener);
    }
    const onMapClick = (e: any) => {
      if (gisMode !== GISMode.DEFAULT) return;
      if (!kakaoGisRef.current.geocoder) return;

      const pos = e.latLng;
      kakaoGisRef.current.geocoder.coord2Address(pos.getLng(), pos.getLat(), (result: any, status: any) => {
        if (status === window.kakao.maps.services.Status.OK) {
          const address = result[0].road_address?.address_name || result[0].address?.address_name || '주소없음';
          const content = `<div class="info-overlay"><div class="font-bold">📍 ${address}</div></div>`;
          const overlay = new window.kakao.maps.CustomOverlay({
            position: pos, content: content, yAnchor: 2.2, map: mapRef.current
          });
          setTimeout(() => overlay.setMap(null), 3000);
        }
      });
    };
    kakaoGisRef.current.addressClickListener = onMapClick;
    window.kakao.maps.event.addListener(mapRef.current, 'click', onMapClick);
  };
  
  useEffect(() => {
    if (config.type === 'kakao' && mapRef.current && sdkLoaded) {
        setupKakaoAddressClick();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gisMode, config.type, sdkLoaded]);


  // 4. Update Effects
  useEffect(() => {
    if (!mapRef.current) return;
    if (isDragging.current) return;
    isProgrammaticUpdate.current = true;
    try {
        if (config.type === 'google') {
          mapRef.current.setCenter({ lat: globalState.lat, lng: globalState.lng });
          mapRef.current.setZoom(globalState.zoom);
        } else if (config.type === 'kakao') {
          const center = mapRef.current.getCenter();
          if (Math.abs(center.getLat() - globalState.lat) > 0.000001 || Math.abs(center.getLng() - globalState.lng) > 0.000001) {
             mapRef.current.setCenter(new window.kakao.maps.LatLng(globalState.lat, globalState.lng));
          }
          mapRef.current.setLevel(zoomToKakao(globalState.zoom));
        } else if (config.type === 'naver') {
          mapRef.current.setCenter(new window.naver.maps.LatLng(globalState.lat, globalState.lng));
          mapRef.current.setZoom(globalState.zoom);
        }
    } catch(e) {}
    setTimeout(() => { isProgrammaticUpdate.current = false; }, 200); 
  }, [globalState.lat, globalState.lng, globalState.zoom, config.type, sdkLoaded]);

  useEffect(() => {
    if (!mapRef.current) return;
    try {
      if (config.type === 'google') {
        mapRef.current.setMapTypeId(config.isSatellite ? 'satellite' : 'roadmap');
      } else if (config.type === 'kakao') {
        mapRef.current.setMapTypeId(config.isSatellite ? window.kakao.maps.MapTypeId.HYBRID : window.kakao.maps.MapTypeId.ROADMAP);
      } else if (config.type === 'naver') {
        mapRef.current.setMapTypeId(config.isSatellite ? window.naver.maps.MapTypeId.SATELLITE : window.naver.maps.MapTypeId.NORMAL);
      }
    } catch(e) {}
  }, [config.isSatellite, config.type, sdkLoaded]);

  useEffect(() => {
    if (!mapRef.current) return;
    if (markerRef.current) {
        try { markerRef.current.setMap(null); } catch(e){}
    }
    if (searchPos) {
      try {
          if (config.type === 'google') {
            markerRef.current = new window.google.maps.Marker({ position: searchPos, map: mapRef.current });
          } else if (config.type === 'kakao') {
            markerRef.current = new window.kakao.maps.Marker({ position: new window.kakao.maps.LatLng(searchPos.lat, searchPos.lng), map: mapRef.current });
          } else if (config.type === 'naver') {
            markerRef.current = new window.naver.maps.Marker({ position: new window.naver.maps.LatLng(searchPos.lat, searchPos.lng), map: mapRef.current });
          }
      } catch(e) {}
    }
  }, [searchPos, config.type, sdkLoaded]);

  // -- Street View Synchronization Effect --
  useEffect(() => {
    // 다른 패널에서 거리뷰 위치가 변경되면 현재 패널도 동일한 위치의 거리뷰 표시
    // 단, 현재 패널이 이미 해당 위치의 거리뷰를 보고 있으면 무시
    if (!streetViewState || !streetViewState.active || !mapRef.current || !sdkLoaded) {
      return;
    }

    const { lat, lng } = streetViewState;
    
    // 현재 거리뷰 위치와 동일하면 무시 (무한 루프 방지)
    if (isStreetViewActive) {
      let currentLat = 0, currentLng = 0;
      if (config.type === 'google' && googlePanoInstanceRef.current && googlePanoInstanceRef.current.getPosition()) {
        const pos = googlePanoInstanceRef.current.getPosition();
        currentLat = pos.lat();
        currentLng = pos.lng();
      } else if (config.type === 'kakao' && kakaoGisRef.current.rv && kakaoGisRef.current.rv.getPosition()) {
        const pos = kakaoGisRef.current.rv.getPosition();
        currentLat = pos.getLat();
        currentLng = pos.getLng();
      } else if (config.type === 'naver' && naverPanoramaRef.current && naverPanoramaRef.current.getPosition()) {
        const pos = naverPanoramaRef.current.getPosition();
        currentLat = pos.lat();
        currentLng = pos.lng();
      }
      
      // 위치 차이가 매우 작으면 (같은 위치) 무시
      if (Math.abs(currentLat - lat) < 0.0001 && Math.abs(currentLng - lng) < 0.0001) {
        return;
      }
    }
    
    // 현재 패널이 이미 거리뷰를 보고 있지 않은 경우에만 동기화
    if (!isStreetViewActive) {
      if (config.type === 'google' && googlePanoInstanceRef.current) {
        // 구글맵 거리뷰 시작
        googlePanoInstanceRef.current.setPosition({ lat, lng });
        googlePanoInstanceRef.current.setVisible(true);
        setIsStreetViewActive(true);
      } else if (config.type === 'kakao' && kakaoGisRef.current.rvClient) {
        // 카카오맵 로드뷰 시작
        const pos = new window.kakao.maps.LatLng(lat, lng);
        kakaoGisRef.current.rvClient.getNearestPanoId(pos, 50, (panoId: any) => {
          if (panoId && roadviewRef.current) {
            setIsStreetViewActive(true);
            setTimeout(() => {
              if (roadviewRef.current && mapRef.current) {
                const rv = new window.kakao.maps.Roadview(roadviewRef.current);
                rv.setPanoId(panoId, pos);
                kakaoGisRef.current.rv = rv;
                
                // 미니맵 중앙으로 이동 및 지도 리사이즈
                mapRef.current.setCenter(pos);
                mapRef.current.relayout(); // 미니맵 전환 후 리사이즈 필수
                
                // 지도 리사이즈 완료 후 Walker 생성 (컨테이너 크기 변경 대기)
                setTimeout(() => {
                  if (!mapRef.current) return;
                  
                  // 초기 viewpoint 각도 가져오기
                  const initialViewpoint = rv.getViewpoint();
                  const initialAngle = initialViewpoint ? initialViewpoint.pan : 0;
                  
                  // Walker 생성 또는 업데이트 (초기 각도 포함)
                  if (!kakaoGisRef.current.walkerOverlay) {
                    createKakaoWalker(pos, mapRef.current, initialAngle);
                  } else {
                    kakaoGisRef.current.walkerOverlay.setPosition(pos);
                    kakaoGisRef.current.walkerOverlay.setMap(mapRef.current);
                    // 기존 walker의 각도도 업데이트
                    const content = kakaoGisRef.current.walkerOverlay.getContent();
                    if (content) {
                      content.style.transformOrigin = 'center bottom';
                      content.style.transform = `rotate(${initialAngle}deg)`;
                    }
                  }
                  
                  // 위치 변경 이벤트 리스너 (중복 방지)
                  if (kakaoGisRef.current.rv) {
                    window.kakao.maps.event.removeListener(kakaoGisRef.current.rv, 'position_changed');
                    window.kakao.maps.event.removeListener(kakaoGisRef.current.rv, 'viewpoint_changed');
                  }
                  
                  const positionListener = () => {
                    const rvPos = rv.getPosition();
                    if (kakaoGisRef.current.walkerOverlay && mapRef.current) {
                      kakaoGisRef.current.walkerOverlay.setPosition(rvPos);
                      kakaoGisRef.current.walkerOverlay.setMap(mapRef.current);
                    }
                    if (mapRef.current) {
                      mapRef.current.setCenter(rvPos);
                    }
                  };
                  
                  const viewpointListener = () => {
                    const viewpoint = rv.getViewpoint();
                    if (kakaoGisRef.current.walkerOverlay) {
                      const content = kakaoGisRef.current.walkerOverlay.getContent();
                      if (content) {
                        content.style.transformOrigin = 'center bottom'; // 회전 중심을 하단 중앙으로 설정
                        content.style.transform = `rotate(${viewpoint.pan}deg)`;
                      }
                    }
                  };
                  
                  window.kakao.maps.event.addListener(rv, 'position_changed', positionListener);
                  window.kakao.maps.event.addListener(rv, 'viewpoint_changed', viewpointListener);
                }, 400); // 컨테이너 크기 변경 완료 대기 (350ms 트랜지션 + 여유)
              }
            }, 300);
          }
        });
      } else if (config.type === 'naver' && naverStreetLayerRef.current) {
        // 네이버맵 거리뷰 시작
        const latlng = new window.naver.maps.LatLng(lat, lng);
        
        // 거리뷰 레이어 활성화 (없으면 활성화)
        if (!naverStreetLayerRef.current.getMap()) {
          naverStreetLayerRef.current.setMap(mapRef.current);
          setIsNaverLayerOn(true);
        }
        
        setIsStreetViewActive(true);
        
        setTimeout(() => {
          const container = naverPanoContainerRef.current;
          if (!container) {
            console.error('Naver Panorama: 컨테이너가 없습니다');
            return;
          }
          
          // 컨테이너 크기 확인 및 설정
          if (container.offsetWidth === 0 || container.offsetHeight === 0) {
            setTimeout(() => {
              if (container.offsetWidth > 0 && container.offsetHeight > 0) {
                if (!naverPanoramaRef.current) {
                  initNaverPanorama(container, latlng, mapRef.current);
                } else {
                  naverPanoramaRef.current.setPosition(latlng);
                  window.naver.maps.Event.trigger(naverPanoramaRef.current, 'resize');
                }
                
                // 미니맵 중앙으로 이동
                mapRef.current.setCenter(latlng);
                
                // Marker 생성 또는 업데이트 (삼각형 마커, 방향 표시)
                const pov = naverPanoramaRef.current ? naverPanoramaRef.current.getPov() : null;
                const angle = pov ? pov.pan : 0;
                if (!naverMarkerRef.current) {
                  const icon = createNaverTriangleMarker(angle);
                  naverMarkerRef.current = new window.naver.maps.Marker({
                    position: latlng,
                    map: mapRef.current,
                    icon: icon,
                    angle: angle
                  });
                } else {
                  naverMarkerRef.current.setMap(mapRef.current);
                  naverMarkerRef.current.setPosition(latlng);
                  naverMarkerRef.current.setIcon(createNaverTriangleMarker(angle));
                  if (typeof naverMarkerRef.current.setAngle === 'function') {
                    naverMarkerRef.current.setAngle(angle);
                  }
                }
              }
            }, 200);
            return;
          }
          
          if (!naverPanoramaRef.current) {
            initNaverPanorama(container, latlng, mapRef.current);
            // 파노라마 초기화 후 리사이즈 이벤트 트리거 (렌더링 보장)
            setTimeout(() => {
              if (naverPanoramaRef.current) {
                window.naver.maps.Event.trigger(naverPanoramaRef.current, 'resize');
              }
            }, 200);
          } else {
            naverPanoramaRef.current.setPosition(latlng);
            setTimeout(() => {
              if (naverPanoramaRef.current) {
                window.naver.maps.Event.trigger(naverPanoramaRef.current, 'resize');
              }
            }, 100);
          }
          
          // 미니맵 중앙으로 이동
          mapRef.current.setCenter(latlng);
          
          // Marker 생성 또는 업데이트 (삼각형 마커, 방향 표시) - 파노라마 초기화 후
          setTimeout(() => {
            const pov = naverPanoramaRef.current ? naverPanoramaRef.current.getPov() : null;
            const angle = pov ? pov.pan : 0;
            if (!naverMarkerRef.current) {
              const icon = createNaverTriangleMarker(angle);
              naverMarkerRef.current = new window.naver.maps.Marker({
                position: latlng,
                map: mapRef.current,
                icon: icon,
                angle: angle
              });
            } else {
              naverMarkerRef.current.setMap(mapRef.current);
              naverMarkerRef.current.setPosition(latlng);
              naverMarkerRef.current.setIcon(createNaverTriangleMarker(angle));
              if (typeof naverMarkerRef.current.setAngle === 'function') {
                naverMarkerRef.current.setAngle(angle);
              }
            }
          }, 300);
        }, 150);
      }
    } else {
      // 이미 거리뷰가 활성화된 경우 위치만 업데이트
      if (config.type === 'google' && googlePanoInstanceRef.current) {
        googlePanoInstanceRef.current.setPosition({ lat, lng });
      } else if (config.type === 'kakao' && kakaoGisRef.current.rv && kakaoGisRef.current.rvClient) {
        const pos = new window.kakao.maps.LatLng(lat, lng);
        kakaoGisRef.current.rvClient.getNearestPanoId(pos, 50, (panoId: any) => {
          if (panoId && mapRef.current) {
            kakaoGisRef.current.rv.setPanoId(panoId, pos);
            mapRef.current.setCenter(pos);
            mapRef.current.relayout(); // 리사이즈 보장
            
            // Walker 업데이트 또는 생성
            setTimeout(() => {
              if (kakaoGisRef.current.walkerOverlay && mapRef.current) {
                kakaoGisRef.current.walkerOverlay.setPosition(pos);
                kakaoGisRef.current.walkerOverlay.setMap(mapRef.current);
              } else if (mapRef.current) {
                createKakaoWalker(pos, mapRef.current);
              }
            }, 150);
          }
        });
      } else if (config.type === 'naver' && naverPanoramaRef.current) {
        const latlng = new window.naver.maps.LatLng(lat, lng);
        naverPanoramaRef.current.setPosition(latlng);
        window.naver.maps.Event.trigger(naverPanoramaRef.current, 'resize');
        mapRef.current.setCenter(latlng);
        const pov = naverPanoramaRef.current.getPov();
        const angle = pov ? pov.pan : 0;
        if (naverMarkerRef.current) {
          naverMarkerRef.current.setPosition(latlng);
          naverMarkerRef.current.setMap(mapRef.current);
          naverMarkerRef.current.setIcon(createNaverTriangleMarker(angle));
          if (typeof naverMarkerRef.current.setAngle === 'function') {
            naverMarkerRef.current.setAngle(angle);
          }
        } else {
          // 마커가 없으면 생성 (삼각형 마커)
          const icon = createNaverTriangleMarker(angle);
          naverMarkerRef.current = new window.naver.maps.Marker({
            position: latlng,
            map: mapRef.current,
            icon: icon,
            angle: angle
          });
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streetViewState, config.type, sdkLoaded]);

  // -- Naver Street View Click Listener & Marker Sync --
  useEffect(() => {
    if (config.type === 'naver' && mapRef.current && sdkLoaded) {
        const map = mapRef.current;
        
        // Listen to map clicks to open Panorama
        const clickListener = window.naver.maps.Event.addListener(map, 'click', (e: any) => {
            const streetLayer = naverStreetLayerRef.current;
            
            // Only proceed if the Street Layer is currently ON
            if (streetLayer && streetLayer.getMap()) {
                const latlng = e.coord;
                
                // Show Panorama UI
                setIsStreetViewActive(true);
                
                // Init Panorama & Marker (거리뷰 활성화 후 컨테이너가 렌더링될 때까지 대기)
                setTimeout(() => {
                    const container = naverPanoContainerRef.current;
                    if (!container) {
                        console.error('Naver Panorama: 컨테이너가 없습니다');
                        return;
                    }

                    try {
                        // 미니맵 중앙으로 이동
                        mapRef.current.setCenter(latlng);
                        
                        // 컨테이너 크기 확인 및 설정
                        if (container.offsetWidth === 0 || container.offsetHeight === 0) {
                            setTimeout(() => {
                                if (container.offsetWidth > 0 && container.offsetHeight > 0) {
                                    if (!naverPanoramaRef.current) {
                                        initNaverPanorama(container, latlng, map);
                                    } else {
                                        naverPanoramaRef.current.setPosition(latlng);
                                        window.naver.maps.Event.trigger(naverPanoramaRef.current, 'resize');
                                    }
                                    
                                    // 거리뷰 상태 업데이트 (동기화를 위해)
                                    onStreetViewChange({ lat: latlng.lat(), lng: latlng.lng(), active: true });
                                    
                                    // Marker 생성 또는 업데이트 (삼각형 마커, 방향 표시)
                                    const pov = naverPanoramaRef.current ? naverPanoramaRef.current.getPov() : null;
                                    const angle = pov ? pov.pan : 0;
                                    if (!naverMarkerRef.current) {
                                        const icon = createNaverTriangleMarker(angle);
                                        naverMarkerRef.current = new window.naver.maps.Marker({
                                            position: latlng,
                                            map: mapRef.current,
                                            icon: icon,
                                            angle: angle
                                        });
                                    } else {
                                        naverMarkerRef.current.setMap(mapRef.current);
                                        naverMarkerRef.current.setPosition(latlng);
                                        naverMarkerRef.current.setIcon(createNaverTriangleMarker(angle));
                                        if (typeof naverMarkerRef.current.setAngle === 'function') {
                                            naverMarkerRef.current.setAngle(angle);
                                        }
                                    }
                                }
                            }, 200);
                            return;
                        }

                        // Create or Update Panorama
                        if (!naverPanoramaRef.current) {
                            initNaverPanorama(container, latlng, map);
                            // 파노라마 초기화 후 리사이즈 이벤트 트리거 (렌더링 보장)
                            setTimeout(() => {
                                if (naverPanoramaRef.current) {
                                    window.naver.maps.Event.trigger(naverPanoramaRef.current, 'resize');
                                }
                            }, 200);
                        } else {
                            // 기존 파노라마 위치 업데이트
                            naverPanoramaRef.current.setPosition(latlng);
                            // 리사이즈 이벤트 트리거
                            setTimeout(() => {
                                if (naverPanoramaRef.current) {
                                    window.naver.maps.Event.trigger(naverPanoramaRef.current, 'resize');
                                }
                            }, 100);
                        }

                        // 거리뷰 상태 업데이트 (동기화를 위해)
                        onStreetViewChange({ lat: latlng.lat(), lng: latlng.lng(), active: true });
                        
                        // Create Marker on Map if not exists - 미니맵 중앙에 위치 (삼각형 마커, 방향 표시) - 파노라마 초기화 후
                        setTimeout(() => {
                            const pov = naverPanoramaRef.current ? naverPanoramaRef.current.getPov() : null;
                            const angle = pov ? pov.pan : 0;
                            if (!naverMarkerRef.current) {
                                const icon = createNaverTriangleMarker(angle);
                                naverMarkerRef.current = new window.naver.maps.Marker({
                                    position: latlng,
                                    map: mapRef.current,
                                    icon: icon,
                                    angle: angle
                                });
                            } else {
                                naverMarkerRef.current.setMap(mapRef.current);
                                naverMarkerRef.current.setPosition(latlng);
                                naverMarkerRef.current.setIcon(createNaverTriangleMarker(angle));
                                if (typeof naverMarkerRef.current.setAngle === 'function') {
                                    naverMarkerRef.current.setAngle(angle);
                                }
                            }
                        }, 300);
                    } catch (error) {
                        console.error('Naver Panorama 생성 오류:', error);
                        setIsStreetViewActive(false);
                    }
                }, 150);
            }
        });

        return () => {
            window.naver.maps.Event.removeListener(clickListener);
        };
    }
  }, [config.type, sdkLoaded]);


  // -- Kakao Measurement Effect --
  useEffect(() => {
    if (config.type !== 'kakao' || !mapRef.current) return;
    
    // Clear listeners from previous mode
    kakaoDrawingRef.current.listeners.forEach(fn => fn());
    kakaoDrawingRef.current.listeners = [];
    
    // Clear previous overlays
    kakaoDrawingRef.current.overlays.forEach(o => o.setMap(null));
    kakaoDrawingRef.current.overlays = [];

    const map = mapRef.current;

    // 1. Distance Measurement
    if (gisMode === GISMode.DISTANCE) {
        map.setCursor('crosshair');
        let currentLine: any = null;
        let floatingOverlay: any = null;
        let fixedOverlays: any[] = [];
        
        // 거리 계산 헬퍼 함수 (Haversine formula)
        const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number) => {
            const R = 6371000; // 지구 반지름 (미터)
            const dLat = (lat2 - lat1) * Math.PI / 180;
            const dLng = (lng2 - lng1) * Math.PI / 180;
            const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                      Math.sin(dLng / 2) * Math.sin(dLng / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            return R * c;
        };
        
        const updateFloatingDistance = (mousePos: any) => {
            if (!currentLine) return;
            
            const path = currentLine.getPath();
            if (path.length === 0) return;
            
            // 마지막 포인트와 마우스 위치 사이의 거리 계산
            const lastPoint = path[path.length - 1];
            const distance = Math.round(calculateDistance(
                lastPoint.getLat(), lastPoint.getLng(),
                mousePos.getLat(), mousePos.getLng()
            ));
            
            // 플로우팅 오버레이 업데이트
            if (floatingOverlay) {
                floatingOverlay.setPosition(mousePos);
                const content = floatingOverlay.getContent();
                if (content) {
                    content.innerHTML = `<div class="measure-label" style="background:rgba(255,255,255,0.9); border:1px solid #333; padding:4px 6px; border-radius:4px; font-size:12px; box-shadow:0 2px 4px rgba(0,0,0,0.2);">${distance}m</div>`;
                }
            } else {
                const content = document.createElement('div');
                content.innerHTML = `<div class="measure-label" style="background:rgba(255,255,255,0.9); border:1px solid #333; padding:4px 6px; border-radius:4px; font-size:12px; box-shadow:0 2px 4px rgba(0,0,0,0.2);">${distance}m</div>`;
                floatingOverlay = new window.kakao.maps.CustomOverlay({
                    map: map,
                    position: mousePos,
                    content: content,
                    yAnchor: 2,
                    zIndex: 100
                });
                kakaoDrawingRef.current.overlays.push(floatingOverlay);
            }
        };
        
        const handleClick = (e: any) => {
            const pos = e.latLng;
            
            if (!currentLine) {
                // 첫 번째 포인트
                currentLine = new window.kakao.maps.Polyline({
                    map: map,
                    path: [pos],
                    strokeWeight: 3,
                    strokeColor: '#FF3333',
                    strokeOpacity: 1,
                    strokeStyle: 'solid',
                    zIndex: 10
                });
                kakaoDrawingRef.current.polylines.push(currentLine);
            } else {
                // 두 번째 포인트 이후
                const path = currentLine.getPath();
                path.push(pos);
                currentLine.setPath(path);
                
                // 고정 거리 표시
                const segmentLength = path.length >= 2 
                    ? Math.round(calculateDistance(
                        path[path.length - 2].getLat(), path[path.length - 2].getLng(),
                        path[path.length - 1].getLat(), path[path.length - 1].getLng()
                    ))
                    : 0;
                
                const content = document.createElement('div');
                content.innerHTML = `<div class="measure-label" style="background:white; border:1px solid #333; padding:4px 6px; border-radius:4px; font-size:12px;">${segmentLength}m</div>`;
                const fixedOverlay = new window.kakao.maps.CustomOverlay({
                    map: map,
                    position: pos,
                    content: content,
                    yAnchor: 2,
                    zIndex: 50
                });
                fixedOverlays.push(fixedOverlay);
                kakaoDrawingRef.current.overlays.push(fixedOverlay);
            }
        };
        
        const handleMouseMove = (e: any) => {
            if (currentLine) {
                updateFloatingDistance(e.latLng);
            }
        };
        
        const handleRightClick = (e: any) => {
            if (currentLine) {
                const path = currentLine.getPath();
                if (path.length < 2) {
                    map.setCursor('default');
                    currentLine.setMap(null);
                    currentLine = null;
                    return;
                }
                
                const totalLength = Math.round(currentLine.getLength());
                const lastPos = path[path.length - 1];
                
                // 플로우팅 오버레이 제거
                if (floatingOverlay) {
                    floatingOverlay.setMap(null);
                    floatingOverlay = null;
                }
                
                // 전체 거리 표시 및 close 버튼
                const closeBtn = document.createElement('button');
                closeBtn.innerHTML = '✕';
                closeBtn.style.cssText = 'position:absolute; top:-8px; right:-8px; width:20px; height:20px; border-radius:50%; background:#ff4444; color:white; border:none; cursor:pointer; font-size:12px; line-height:1; box-shadow:0 2px 4px rgba(0,0,0,0.3);';
                closeBtn.onclick = () => {
                    if (currentLine) currentLine.setMap(null);
                    fixedOverlays.forEach(o => o.setMap(null));
                    if (floatingOverlay) floatingOverlay.setMap(null);
                    map.setCursor('default');
                    setGisMode(GISMode.DEFAULT);
                };
                
                const content = document.createElement('div');
                content.style.position = 'relative';
                content.innerHTML = `<div class="measure-label" style="background:white; border:2px solid #FF3333; padding:6px 8px; border-radius:4px; font-size:14px; font-weight:bold; color:#FF3333;">총 거리: ${totalLength}m</div>`;
                content.appendChild(closeBtn);
                
                const totalOverlay = new window.kakao.maps.CustomOverlay({
                    map: map,
                    position: lastPos,
                    content: content,
                    yAnchor: 2,
                    zIndex: 100
                });
                kakaoDrawingRef.current.overlays.push(totalOverlay);
                
                map.setCursor('default');
                currentLine = null;
                fixedOverlays = [];
            }
        };

        window.kakao.maps.event.addListener(map, 'click', handleClick);
        window.kakao.maps.event.addListener(map, 'mousemove', handleMouseMove);
        window.kakao.maps.event.addListener(map, 'rightclick', handleRightClick);
        
        kakaoDrawingRef.current.listeners.push(
            () => window.kakao.maps.event.removeListener(map, 'click', handleClick),
            () => window.kakao.maps.event.removeListener(map, 'mousemove', handleMouseMove),
            () => window.kakao.maps.event.removeListener(map, 'rightclick', handleRightClick)
        );
    } 
    // 2. Area Measurement
    else if (gisMode === GISMode.AREA) {
        map.setCursor('crosshair');
        let currentPoly: any = null;
        let floatingOverlay: any = null;
        
        const updateFloatingArea = (mousePos: any) => {
            if (!currentPoly) return;
            
            const path = currentPoly.getPath();
            if (path.length < 2) return;
            
            // 마우스 위치를 포함한 임시 경로로 면적 계산
            const tempPath = [...path, mousePos];
            const tempPoly = new window.kakao.maps.Polygon({
                path: tempPath,
                strokeWeight: 0,
                fillColor: 'transparent',
                fillOpacity: 0
            });
            const area = Math.round(tempPoly.getArea());
            
            // 플로우팅 오버레이 업데이트
            if (floatingOverlay) {
                floatingOverlay.setPosition(mousePos);
                floatingOverlay.setContent(`<div class="measure-label" style="background:rgba(255,255,255,0.9); border:1px solid #333; padding:4px 6px; border-radius:4px; font-size:12px; box-shadow:0 2px 4px rgba(0,0,0,0.2);">${area}m²</div>`);
            } else {
                const content = document.createElement('div');
                content.innerHTML = `<div class="measure-label" style="background:rgba(255,255,255,0.9); border:1px solid #333; padding:4px 6px; border-radius:4px; font-size:12px; box-shadow:0 2px 4px rgba(0,0,0,0.2);">${area}m²</div>`;
                floatingOverlay = new window.kakao.maps.CustomOverlay({
                    map: map,
                    position: mousePos,
                    content: content,
                    yAnchor: 2,
                    zIndex: 100
                });
                kakaoDrawingRef.current.overlays.push(floatingOverlay);
            }
        };
        
        const handleClick = (e: any) => {
            const pos = e.latLng;
            if (!currentPoly) {
                currentPoly = new window.kakao.maps.Polygon({
                    map: map,
                    path: [pos],
                    strokeWeight: 3,
                    strokeColor: '#39f',
                    strokeOpacity: 0.8,
                    fillColor: '#A2D4EC',
                    fillOpacity: 0.5, 
                    zIndex: 10
                });
                kakaoDrawingRef.current.polygons.push(currentPoly);
            } else {
                const path = currentPoly.getPath();
                path.push(pos);
                currentPoly.setPath(path);
            }
        };
        
        const handleMouseMove = (e: any) => {
            if (currentPoly && currentPoly.getPath().length >= 2) {
                updateFloatingArea(e.latLng);
            }
        };
        
        const handleRightClick = (e: any) => {
            if (currentPoly) {
                const path = currentPoly.getPath();
                if (path.length >= 3) {
                    const area = Math.round(currentPoly.getArea());
                    const lastPos = path[path.length - 1];
                    
                    // 플로우팅 오버레이 제거
                    if (floatingOverlay) {
                        floatingOverlay.setMap(null);
                        floatingOverlay = null;
                    }
                    
                    // 면적 표시 및 close 버튼
                    const closeBtn = document.createElement('button');
                    closeBtn.innerHTML = '✕';
                    closeBtn.style.cssText = 'position:absolute; top:-8px; right:-8px; width:20px; height:20px; border-radius:50%; background:#ff4444; color:white; border:none; cursor:pointer; font-size:12px; line-height:1; box-shadow:0 2px 4px rgba(0,0,0,0.3);';
                    closeBtn.onclick = () => {
                        if (currentPoly) currentPoly.setMap(null);
                        if (floatingOverlay) floatingOverlay.setMap(null);
                        map.setCursor('default');
                        setGisMode(GISMode.DEFAULT);
                    };
                    
                    const content = document.createElement('div');
                    content.style.position = 'relative';
                    content.innerHTML = `<div class="measure-label" style="background:white; border:2px solid #39f; padding:6px 8px; border-radius:4px; font-size:14px; font-weight:bold; color:#39f;">면적: ${area}m²</div>`;
                    content.appendChild(closeBtn);
                    
                    const areaOverlay = new window.kakao.maps.CustomOverlay({
                        map: map,
                        position: lastPos,
                        content: content,
                        yAnchor: 2,
                        zIndex: 100
                    });
                    kakaoDrawingRef.current.overlays.push(areaOverlay);
                    
                    currentPoly = null;
                    map.setCursor('default');
                }
            }
        };

        window.kakao.maps.event.addListener(map, 'click', handleClick);
        window.kakao.maps.event.addListener(map, 'mousemove', handleMouseMove);
        window.kakao.maps.event.addListener(map, 'rightclick', handleRightClick);
        
        kakaoDrawingRef.current.listeners.push(
            () => window.kakao.maps.event.removeListener(map, 'click', handleClick),
            () => window.kakao.maps.event.removeListener(map, 'mousemove', handleMouseMove),
            () => window.kakao.maps.event.removeListener(map, 'rightclick', handleRightClick)
        );
    }
  }, [gisMode, config.type]);


  // 5. Actions
  const handleKakaoAction = useCallback((mode: GISMode) => {
     if (config.type !== 'kakao' || !mapRef.current) return;
     
     // Reset previous Road View mode if active
     if (gisMode === GISMode.ROADVIEW && mode !== GISMode.ROADVIEW) {
         mapRef.current.removeOverlayMapTypeId(window.kakao.maps.MapTypeId.ROADVIEW);
         if (kakaoGisRef.current.clickHandler) {
             window.kakao.maps.event.removeListener(mapRef.current, 'click', kakaoGisRef.current.clickHandler);
             kakaoGisRef.current.clickHandler = null;
         }
         if (kakaoGisRef.current.walkerOverlay) {
             kakaoGisRef.current.walkerOverlay.setMap(null);
             kakaoGisRef.current.walkerOverlay = null;
         }
     }
     mapRef.current.setCursor('default');

     if (mode === GISMode.ROADVIEW) {
       mapRef.current.addOverlayMapTypeId(window.kakao.maps.MapTypeId.ROADVIEW);
       mapRef.current.setCursor('crosshair');
       
       const clickHandler = (e: any) => {
         const pos = e.latLng;
         kakaoGisRef.current.rvClient.getNearestPanoId(pos, 50, (panoId: any) => {
           if (panoId) {
             setIsStreetViewActive(true); 
             setTimeout(() => {
               if (roadviewRef.current) {
                 const rv = new window.kakao.maps.Roadview(roadviewRef.current);
                 rv.setPanoId(panoId, pos);
                 kakaoGisRef.current.rv = rv;

                 // 미니맵 중앙으로 이동 및 지도 리사이즈
                 mapRef.current.setCenter(pos);
                 mapRef.current.relayout(); // 미니맵 전환 후 리사이즈 필수
                 
                 // 거리뷰 상태 업데이트 (동기화를 위해)
                 onStreetViewChange({ lat: pos.getLat(), lng: pos.getLng(), active: true });
                 
                 // 지도 리사이즈 완료 후 Walker 생성 (컨테이너 크기 변경 대기)
                 setTimeout(() => {
                   // 초기 viewpoint 각도 가져오기
                   const initialViewpoint = rv.getViewpoint();
                   const initialAngle = initialViewpoint ? initialViewpoint.pan : 0;
                   
                   // Walker 생성 또는 업데이트 (초기 각도 포함)
                   if (!kakaoGisRef.current.walkerOverlay) {
                     createKakaoWalker(pos, mapRef.current, initialAngle);
                   } else {
                     kakaoGisRef.current.walkerOverlay.setPosition(pos);
                     kakaoGisRef.current.walkerOverlay.setMap(mapRef.current);
                     // 기존 walker의 각도도 업데이트
                     const content = kakaoGisRef.current.walkerOverlay.getContent();
                     if (content) {
                       content.style.transformOrigin = 'center bottom';
                       content.style.transform = `rotate(${initialAngle}deg)`;
                     }
                   }
                   
                   // 위치 변경 이벤트 리스너 (중복 방지)
                   if (kakaoGisRef.current.rv) {
                     window.kakao.maps.event.removeListener(kakaoGisRef.current.rv, 'position_changed');
                     window.kakao.maps.event.removeListener(kakaoGisRef.current.rv, 'viewpoint_changed');
                   }
                   
                   const positionListener = () => {
                     const rvPos = rv.getPosition();
                     isDragging.current = true; 
                     
                     // Sync Map Center - 미니맵 중앙으로 이동
                     try {
                       const currentZoom = mapRef.current && typeof mapRef.current.getLevel === 'function' 
                         ? kakaoToZoom(mapRef.current.getLevel()) 
                         : globalState.zoom;
                       const lat = rvPos.getLat();
                       const lng = rvPos.getLng();
                       
                       // 미니맵 중앙으로 이동
                       if (mapRef.current) {
                         mapRef.current.setCenter(rvPos);
                       }
                       onStateChange({ lat, lng, zoom: currentZoom });
                     } catch (error) {
                       console.error('Kakao Roadview sync error:', error);
                     }
                     
                     // 거리뷰 상태 업데이트 (동기화를 위해)
                     onStreetViewChange({ lat: rvPos.getLat(), lng: rvPos.getLng(), active: true });
                     
                     // Sync Walker - 미니맵 중앙에 위치
                     if (kakaoGisRef.current.walkerOverlay && mapRef.current) {
                       kakaoGisRef.current.walkerOverlay.setPosition(rvPos);
                       kakaoGisRef.current.walkerOverlay.setMap(mapRef.current);
                     }

                     setTimeout(() => isDragging.current = false, 200);
                   };
                   
                   const viewpointListener = () => {
                     const viewpoint = rv.getViewpoint();
                     if (kakaoGisRef.current.walkerOverlay) {
                       const content = kakaoGisRef.current.walkerOverlay.getContent();
                       if (content) {
                         content.style.transformOrigin = 'center bottom'; // 회전 중심을 하단 중앙으로 설정
                         content.style.transform = `rotate(${viewpoint.pan}deg)`;
                       }
                     }
                   };
                   
                   window.kakao.maps.event.addListener(rv, 'position_changed', positionListener);
                   window.kakao.maps.event.addListener(rv, 'viewpoint_changed', viewpointListener);
                 }, 400); // 컨테이너 크기 변경 완료 대기 (350ms 트랜지션 + 여유)
               }
             }, 300);
           }
         });
       };
       
       kakaoGisRef.current.clickHandler = clickHandler;
       window.kakao.maps.event.addListener(mapRef.current, 'click', clickHandler);
     }

     setGisMode(mode);
  }, [config.type, gisMode]);

  const toggleKakaoCadastral = useCallback(() => {
    if (config.type !== 'kakao' || !mapRef.current) return;
    const isCadastral = kakaoGisRef.current.roadviewLayer;
    if (isCadastral) mapRef.current.removeOverlayMapTypeId(window.kakao.maps.MapTypeId.USE_DISTRICT);
    else mapRef.current.addOverlayMapTypeId(window.kakao.maps.MapTypeId.USE_DISTRICT);
    kakaoGisRef.current.roadviewLayer = !isCadastral;
  }, [config.type]);

  const toggleNaverStreetLayer = useCallback(() => {
    if (!mapRef.current || !naverStreetLayerRef.current) return;
    
    // Toggle State and Ref for Sync
    const nextState = !isNaverLayerOn;
    setIsNaverLayerOn(nextState);

    if (nextState) {
        naverStreetLayerRef.current.setMap(mapRef.current);
        mapRef.current.setCursor('crosshair');
    } else {
        naverStreetLayerRef.current.setMap(null);
        mapRef.current.setCursor('default');
    }
  }, [isNaverLayerOn]);

  const clearKakaoDrawingResources = () => {
      kakaoDrawingRef.current.polylines.forEach(p => p.setMap(null));
      kakaoDrawingRef.current.polygons.forEach(p => p.setMap(null));
      kakaoDrawingRef.current.overlays.forEach(o => o.setMap(null));
      kakaoDrawingRef.current.listeners.forEach(fn => fn());
      kakaoDrawingRef.current = { polylines: [], polygons: [], overlays: [], listeners: [] };
  };

  const closeStreetView = () => {
    setIsStreetViewActive(false);
    onStreetViewChange(null); // 거리뷰 상태 초기화 (동기화를 위해)
    if (config.type === 'google') {
      if (googlePanoInstanceRef.current) googlePanoInstanceRef.current.setVisible(false);
      if (googleCoverageLayerRef.current) googleCoverageLayerRef.current.setMap(null);
    }
    // Fix: Clean up Kakao Roadview overlays/handlers
    if (config.type === 'kakao' && mapRef.current) {
      if (gisMode === GISMode.ROADVIEW) {
          mapRef.current.removeOverlayMapTypeId(window.kakao.maps.MapTypeId.ROADVIEW);
          if (kakaoGisRef.current.clickHandler) {
              window.kakao.maps.event.removeListener(mapRef.current, 'click', kakaoGisRef.current.clickHandler);
              kakaoGisRef.current.clickHandler = null;
          }
          if (kakaoGisRef.current.walkerOverlay) {
              kakaoGisRef.current.walkerOverlay.setMap(null);
              kakaoGisRef.current.walkerOverlay = null;
          }
          mapRef.current.setCursor('default');
          setGisMode(GISMode.DEFAULT);
      }
    }
    // Fix: Clean up Naver
    if (config.type === 'naver') {
        if (naverPanoramaRef.current) {
            // 파노라마 인스턴스는 유지하되 컨테이너에서 제거하지 않음 (재사용을 위해)
            // 대신 마커만 제거
        }
        if (naverMarkerRef.current) {
            naverMarkerRef.current.setMap(null);
            // 마커는 유지 (다음에 다시 사용할 수 있도록)
        }
    }
  };

  return (
    <div className="w-full h-full relative group bg-gray-50 overflow-hidden">
      {/* 1. Main Map / Mini Map Container */}
      <div 
        ref={containerRef} 
        className={`transition-all duration-300 ease-in-out bg-white
          ${isStreetViewActive 
            ? 'absolute bottom-3 left-3 w-[240px] h-[240px] z-[100] border-4 border-white shadow-2xl rounded-lg overflow-hidden' 
            : 'w-full h-full z-0'
          }`}
      />

      {/* 2. Street View Containers */}
      <div 
        ref={googlePanoRef}
        className={`absolute inset-0 bg-black transition-opacity duration-300 
           ${config.type === 'google' && isStreetViewActive ? 'z-10 opacity-100 pointer-events-auto' : 'z-[-1] opacity-0 pointer-events-none'}`} 
      />

      <div 
        ref={roadviewRef}
        className={`absolute inset-0 bg-black transition-opacity duration-300 
           ${config.type === 'kakao' && isStreetViewActive ? 'z-10 opacity-100 pointer-events-auto' : 'z-[-1] opacity-0 pointer-events-none'}`} 
      />

      <div 
        ref={naverPanoContainerRef}
        className={`absolute bg-black transition-opacity duration-300 
           ${config.type === 'naver' && isStreetViewActive ? 'z-10 opacity-100 pointer-events-auto' : 'z-[-1] opacity-0 pointer-events-none'}`}
        style={{
          position: 'absolute',
          top: config.type === 'naver' && isStreetViewActive ? '0' : 'auto',
          left: config.type === 'naver' && isStreetViewActive ? '0' : 'auto',
          right: config.type === 'naver' && isStreetViewActive ? '0' : 'auto',
          bottom: config.type === 'naver' && isStreetViewActive ? '0' : 'auto',
          width: config.type === 'naver' && isStreetViewActive ? '100%' : '0',
          height: config.type === 'naver' && isStreetViewActive ? '100%' : '0',
          margin: 0,
          padding: 0,
          boxSizing: 'border-box'
        }}
      />

      {/* 3. Close Button (Square Icon) - 모든 맵에서 우상단 */}
      {isStreetViewActive && (
        <button 
          onClick={closeStreetView}
          className="absolute z-[110] bg-white text-gray-800 w-10 h-10 flex items-center justify-center shadow-lg rounded-sm hover:bg-gray-100 transition-colors border border-gray-300 top-4 right-4"
          title="거리뷰 닫기"
        >
          <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>
      )}

      {/* 4. Loading & Controls */}
      {!sdkLoaded && (
         <div className="absolute inset-0 flex items-center justify-center bg-gray-100 z-[120] text-gray-500">
            <span>Loading...</span>
         </div>
      )}

      {/* 전체화면 버튼 - 모든 맵에서 우상단, 거리뷰 활성화 시 오른쪽으로 이동 */}
      <button 
        onClick={onToggleFullscreen}
        className={`absolute z-[110] bg-white p-1.5 rounded shadow border border-gray-300 hover:bg-gray-50 transition-colors top-4 ${
          isStreetViewActive 
            ? 'right-16' 
            : config.type === 'kakao' 
              ? 'right-[280px]' 
              : config.type === 'google'
                ? 'right-16'  // 구글맵 pegman 옆에 배치
                : 'right-4'   // 네이버맵
        }`}
        title="전체화면"
      >
        {isFullscreen ? (
          <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current text-gray-700"><path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/></svg>
        ) : (
          <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current text-gray-700"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>
        )}
      </button>
      
      {/* 네이버 거리뷰 버튼 - 우상단 배치 */}
      {config.type === 'naver' && (
        <button 
          onClick={toggleNaverStreetLayer} 
          className={`absolute top-4 z-[110] w-10 h-10 flex items-center justify-center rounded shadow border transition-colors ${isStreetViewActive ? 'right-28' : 'right-16'} ${isNaverLayerOn ? 'bg-blue-600 text-white border-blue-700' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
          title={isNaverLayerOn ? '거리뷰 끄기' : '거리뷰 켜기'}
        >
          <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
            <circle cx="12" cy="13" r="4"></circle>
          </svg>
        </button>
      )}
      
      {config.type === 'kakao' && (
        <KakaoGisToolbar activeMode={gisMode} onAction={handleKakaoAction} onToggleCadastral={toggleKakaoCadastral} onClear={() => {
              setGisMode(GISMode.DEFAULT);
              if (mapRef.current) {
                mapRef.current.removeOverlayMapTypeId(window.kakao.maps.MapTypeId.ROADVIEW);
                mapRef.current.removeOverlayMapTypeId(window.kakao.maps.MapTypeId.USE_DISTRICT);
                mapRef.current.setCursor('default');
              }
              kakaoGisRef.current.roadviewLayer = false;
              if (kakaoGisRef.current.walkerOverlay) {
                  kakaoGisRef.current.walkerOverlay.setMap(null);
                  kakaoGisRef.current.walkerOverlay = null;
              }
              clearKakaoDrawingResources();
            }}
        />
      )}
    </div>
  );
};

export default MapPane;

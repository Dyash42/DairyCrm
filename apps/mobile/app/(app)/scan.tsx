import { MaterialIcons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/Text';
import { useScanStore } from '@/state/scanStore';
import { colors } from '@/theme/tokens';

/**
 * Camera-backed QR scanner (port of qr_scanner_screen.dart). The decoded
 * payload is stashed in the scan store and we pop back; the home screen
 * resolves it to a delivery row and opens the confirm sheet.
 */
export default function ScanScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const emitted = useRef(false);

  const emit = (raw: string) => {
    const value = raw.trim();
    if (emitted.current || !value) return;
    emitted.current = true;
    useScanStore.getState().setLastScan(value);
    router.back();
  };

  if (!permission) {
    return <View style={styles.black} />;
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.permWrap}>
        <MaterialIcons name="photo-camera" size={48} color={colors.white} />
        <AppText style={styles.permTitle}>Camera access needed</AppText>
        <AppText style={styles.permBody}>
          Jharanai uses the camera to scan each customer&apos;s QR code at the door.
        </AppText>
        <Pressable style={styles.permBtn} onPress={requestPermission}>
          <AppText style={styles.permBtnText}>Grant camera access</AppText>
        </Pressable>
        <Pressable style={styles.permClose} onPress={() => router.back()}>
          <AppText style={styles.permCloseText}>Cancel</AppText>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.black}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={torch}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={({ data }) => emit(data)}
      />

      <SafeAreaView style={styles.overlay}>
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <MaterialIcons name="close" size={26} color={colors.white} />
          </Pressable>
          <Pressable onPress={() => setTorch((t) => !t)} hitSlop={8}>
            <MaterialIcons name={torch ? 'flash-on' : 'flash-off'} size={26} color={colors.white} />
          </Pressable>
        </View>

        <View style={styles.titleWrap}>
          <AppText style={styles.title}>Scan customer QR</AppText>
          <AppText style={styles.subtitle}>Point the camera at the sticker on the door</AppText>
        </View>

        <View style={styles.reticleWrap}>
          <View style={styles.reticle} />
        </View>

        {__DEV__ ? (
          <Pressable style={styles.simBtn} onPress={() => emit('JHR-100455')}>
            <AppText style={styles.simText}>Simulate scan (dev)</AppText>
          </Pressable>
        ) : (
          <View style={{ height: 48 }} />
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  black: { flex: 1, backgroundColor: colors.black },
  overlay: { flex: 1, justifyContent: 'space-between', paddingHorizontal: 16 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 8 },
  titleWrap: { alignItems: 'center', marginTop: 8 },
  title: { color: colors.white, fontSize: 17, fontWeight: '600' },
  subtitle: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 4 },
  reticleWrap: { alignItems: 'center', justifyContent: 'center', flex: 1 },
  reticle: {
    width: 240,
    height: 240,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: colors.accentLight,
  },
  simBtn: {
    height: 48,
    marginBottom: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  simText: { color: colors.white, fontSize: 14, fontWeight: '500' },
  permWrap: {
    flex: 1,
    backgroundColor: colors.black,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  permTitle: { color: colors.white, fontSize: 18, fontWeight: '700', marginTop: 16 },
  permBody: { color: 'rgba(255,255,255,0.7)', fontSize: 14, textAlign: 'center', marginTop: 8 },
  permBtn: {
    marginTop: 24,
    backgroundColor: colors.brand,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 14,
  },
  permBtnText: { color: colors.white, fontSize: 16, fontWeight: '600' },
  permClose: { marginTop: 12, padding: 8 },
  permCloseText: { color: 'rgba(255,255,255,0.7)', fontSize: 14 },
});

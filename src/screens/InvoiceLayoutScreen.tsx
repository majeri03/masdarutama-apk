import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Switch,
  Alert,
  Image,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSize, FontWeight, BorderRadius, Shadow } from '../constants/theme';
import { GlassCard, GradientButton } from '../components/ui';
import api from '../services/api';
import { API_ENDPOINTS, API_BASE_URL } from '../constants/api';
import { useInvoiceLayoutStore, LayoutType } from '../stores/invoice-layout.store';
import { AppToast } from '../utils/toast';

export const InvoiceLayoutScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const layout = useInvoiceLayoutStore();
  const [storeSettings, setStoreSettings] = React.useState<any>(null);

  React.useEffect(() => {
    const fetchStore = async () => {
      try {
        const res = await api.get(API_ENDPOINTS.STORE_SETTINGS);
        if (res.data?.success && res.data?.data) {
          setStoreSettings(res.data.data);
        }
      } catch (e) {
        console.warn('Error fetching settings:', e);
      }
    };
    fetchStore();
  }, []);

  const handleReset = () => {
    Alert.alert(
      'Reset Layout',
      'Apakah Anda yakin ingin mengembalikan pengaturan desain invoice ke default?',
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            layout.resetLayout();
            AppToast.success('Sukses', 'Pengaturan berhasil dikembalikan ke default.');
          },
        },
      ]
    );
  };

  const handleSave = () => {
    AppToast.success('Sukses', 'Pengaturan desain & layout invoice berhasil disimpan!');
  };

  // Mock Invoice Item Render
  const renderPreviewMockup = () => {
    const scale = layout.fontSizeScale;
    const logoUrl = storeSettings?.logoUrl
      ? (storeSettings.logoUrl.startsWith('http') ? storeSettings.logoUrl : `${API_BASE_URL}${storeSettings.logoUrl}`)
      : null;
    
    if (layout.layoutType === 'STRUK_KECIL') {
      return (
        <View style={styles.thermalPreview}>
          {/* Header */}
          {layout.showHeader && (
            <View style={styles.previewCenter}>
              <Text style={[styles.previewTitle, { fontSize: 13 * scale }]}>TB MASDAR UTAMA</Text>
              <Text style={[styles.previewSubtitle, { fontSize: 9 * scale }]}>Distributor Bahan Bangunan</Text>
              <Text style={[styles.previewAddr, { fontSize: 8 * scale }]}>Jl. Poros Maros - Pangkep</Text>
            </View>
          )}
          
          <View style={styles.dottedDivider} />
          
          {/* Meta */}
          <Text style={[styles.previewText, { fontSize: 9 * scale }]}>No: INV/20260524-0001</Text>
          <Text style={[styles.previewText, { fontSize: 9 * scale }]}>Tanggal: 24/05/2026</Text>
          {layout.showCustomerInfo && (
            <Text style={[styles.previewText, { fontSize: 9 * scale, fontWeight: 'bold' }]}>Pelanggan: Umum</Text>
          )}

          <View style={styles.dottedDivider} />

          {/* Items */}
          <View style={styles.previewItemRow}>
            <View>
              <Text style={[styles.previewItemName, { fontSize: 10 * scale }]}>A PLUS Pink</Text>
              <Text style={[styles.previewItemDetail, { fontSize: 8 * scale }]}>2 Zak x Rp 78.000</Text>
            </View>
            <Text style={[styles.previewItemPrice, { fontSize: 10 * scale }]}>Rp 156.000</Text>
          </View>

          <View style={styles.dottedDivider} />

          {/* Totals */}
          <View style={styles.rowBetween}>
            <Text style={[styles.previewLabel, { fontSize: 9 * scale }]}>Subtotal</Text>
            <Text style={[styles.previewVal, { fontSize: 9 * scale }]}>Rp 156.000</Text>
          </View>
          <View style={[styles.rowBetween, { marginTop: 4 }]}>
            <Text style={[styles.previewLabel, { fontSize: 10 * scale, fontWeight: 'bold' }]}>GRAND TOTAL</Text>
            <Text style={[styles.previewVal, { fontSize: 10 * scale, fontWeight: 'bold' }]}>Rp 156.000</Text>
          </View>
          <View style={[styles.rowBetween, { marginTop: 4 }]}>
            <Text style={[styles.previewLabel, { fontSize: 9 * scale }]}>Bayar</Text>
            <Text style={[styles.previewVal, { fontSize: 9 * scale }]}>Rp 156.000</Text>
          </View>

          {/* Payment Info */}
          {layout.showPaymentInfo && (
            <View style={styles.previewBankBox}>
              <Text style={styles.previewBankTitle}>TRANSFER: {layout.bankName}</Text>
              <Text style={styles.previewBankNo}>{layout.bankAccount}</Text>
              <Text style={styles.previewBankName}>a/n {layout.bankHolder}</Text>
            </View>
          )}

          {/* Footer terms */}
          {layout.showFooter && (
            <View style={{ marginTop: 12, alignItems: 'center' }}>
              <Text style={[styles.previewFooterText, { fontSize: 7 * scale }]}>** TERIMA KASIH **</Text>
              <Text style={[styles.previewFooterText, { fontSize: 6.5 * scale, textAlign: 'center' }]} numberOfLines={1}>
                {layout.footerTerms}
              </Text>
            </View>
          )}
        </View>
      );
    } else if (layout.layoutType === 'SURAT_JALAN') {
      return (
        <View style={styles.a4Preview}>
          {/* Header */}
          {layout.showHeader && (
            <View style={[styles.rowBetween, styles.previewA4Header]}>
              <View>
                <Text style={styles.a4StoreName}>TB MASDAR UTAMA</Text>
                <Text style={styles.a4StoreAddr}>Jl. Poros Maros - Pangkep</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.a4DocType}>SURAT JALAN</Text>
                <Text style={styles.a4DocNo}>DO-INV/20260524-0001</Text>
              </View>
            </View>
          )}

          {/* Customer */}
          {layout.showCustomerInfo && (
            <View style={styles.a4CustCard}>
              <Text style={styles.a4CustTitle}>TUJUAN PENGIRIMAN</Text>
              <Text style={styles.a4CustName}>Nama: Umum</Text>
              <Text style={styles.a4CustAddr}>Alamat: -</Text>
            </View>
          )}

          {/* Table */}
          <View style={styles.a4Table}>
            <View style={[styles.rowBetween, styles.a4TableHead]}>
              <Text style={styles.a4Th}>No</Text>
              <Text style={[styles.a4Th, { flex: 2, textAlign: 'left', paddingLeft: Spacing.xs }]}>Barang</Text>
              <Text style={styles.a4Th}>Kuantitas</Text>
            </View>
            <View style={[styles.rowBetween, styles.a4TableRow]}>
              <Text style={styles.a4Td}>1</Text>
              <Text style={[styles.a4Td, { flex: 2, textAlign: 'left', fontWeight: 'bold', paddingLeft: Spacing.xs }]}>A PLUS Pink</Text>
              <Text style={[styles.a4Td, { fontWeight: 'bold' }]}>2 Zak</Text>
            </View>
          </View>

          {/* Signatures */}
          {layout.showSignature && (
            <View style={[styles.rowBetween, { marginTop: 15, paddingHorizontal: Spacing.xs }]}>
              <View style={styles.a4SignBox}>
                <Text style={styles.a4SignLabel}>Penerima,</Text>
                <View style={styles.a4SignLine} />
              </View>
              <View style={styles.a4SignBox}>
                <Text style={styles.a4SignLabel}>Sopir,</Text>
                <View style={styles.a4SignLine} />
              </View>
              <View style={styles.a4SignBox}>
                <Text style={styles.a4SignLabel}>Hormat Kami,</Text>
                <View style={styles.a4SignLine} />
              </View>
            </View>
          )}

          {/* Footer */}
          {layout.showFooter && (
            <View style={styles.a4FooterTerms}>
              <Text style={styles.a4TermsText}>{layout.footerTerms}</Text>
            </View>
          )}
        </View>
      );
    } else if (layout.layoutType === 'INVOICE_BESAR') {
      // INVOICE_BESAR (A4 INVOICE - PRECISELY MATCHES SPECIFIED LAYOUT)
      return (
        <View style={styles.a4Preview}>
          {/* Header Box */}
          {layout.showHeader && (
            <View style={[styles.rowBetween, styles.previewA4Header]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
                {layout.showLogo && (
                  logoUrl ? (
                    <Image source={{ uri: logoUrl }} style={{ width: 44, height: 44, borderRadius: BorderRadius.sm }} resizeMode="contain" />
                  ) : (
                    <View style={{ width: 36, height: 36, backgroundColor: Colors.error, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: BorderRadius.sm }}>
                      {/* Stylized triangle using simple border shapes in RN */}
                      <View style={{ width: 0, height: 0, borderLeftWidth: 14, borderRightWidth: 14, borderBottomWidth: 28, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: '#FFFFFF', position: 'absolute', bottom: -2 }} />
                      <View style={{ width: 0, height: 0, borderLeftWidth: 18, borderRightWidth: 18, borderBottomWidth: 36, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: Colors.error, position: 'absolute', bottom: -2 }} />
                    </View>
                  )
                )}
                <View>
                  <Text style={styles.a4StoreName}>TB MASDAR UTAMA</Text>
                  <Text style={styles.a4StoreAddr}>Jl. Poros Maros - Pangkep</Text>
                  <Text style={styles.a4StorePhone}>Phone: 6285398346677</Text>
                </View>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.a4DocType}>INVOICE</Text>
                <Text style={styles.a4DocNo}>INV/20260524-0001</Text>
                <Text style={styles.a4Meta}>Date: 24/05/2026</Text>
                <Text style={styles.a4Meta}>Pay: CASH</Text>
              </View>
            </View>
          )}

          {/* Customer Info Box */}
          {layout.showCustomerInfo && (
            <View style={styles.a4CustCard}>
              <Text style={styles.a4CustTitle}>CUSTOMER INFO</Text>
              <Text style={styles.a4CustName}>Nama: Umum</Text>
              <Text style={styles.a4CustAddr}>Address: -</Text>
            </View>
          )}

          {/* High legibility A4 Product Table */}
          <View style={styles.a4Table}>
            <View style={[styles.rowBetween, styles.a4TableHead]}>
              <Text style={[styles.a4Th, { flex: 0.3 }]}>No</Text>
              <Text style={[styles.a4Th, { flex: 2, textAlign: 'left', paddingLeft: 4 }]}>Description</Text>
              <Text style={styles.a4Th}>Qty</Text>
              <Text style={styles.a4Th}>Price</Text>
              <Text style={styles.a4Th}>Net</Text>
            </View>
            <View style={[styles.rowBetween, styles.a4TableRow]}>
              <Text style={[styles.a4Td, { flex: 0.3 }]}>1</Text>
              <Text style={[styles.a4Td, { flex: 2, textAlign: 'left', fontWeight: 'bold', paddingLeft: 4 }]}>A PLUS Pink</Text>
              <Text style={styles.a4Td}>2 Zak</Text>
              <Text style={styles.a4Td}>Rp 78k</Text>
              <Text style={[styles.a4Td, { fontWeight: 'bold' }]}>Rp 156k</Text>
            </View>
          </View>

          {/* Bottom details Row */}
          <View style={[styles.rowBetween, { marginTop: 8, alignItems: 'flex-start' }]}>
            {/* Left section: Terbilang, Bank transfer, signature */}
            <View style={{ flex: 1.3, gap: Spacing.xs }}>
              <View style={styles.a4MiniTerbilang}>
                <Text style={styles.a4TerbilangTxt}><Text style={{ fontWeight: 'bold' }}>Terbilang:</Text> Seratus Lima Puluh Enam Ribu Rupiah</Text>
              </View>
              {layout.showPaymentInfo && (
                <View style={styles.a4MiniBank}>
                  <Text style={styles.a4BankTxt}><Text style={{ fontWeight: 'bold' }}>TRANSFER:</Text> {layout.bankName} - {layout.bankAccount}</Text>
                  <Text style={styles.a4BankTxt}>a/n {layout.bankHolder}</Text>
                </View>
              )}
              {layout.showSignature && (
                <View style={{ marginTop: 15 }}>
                  <Text style={styles.a4SignTitle}>Super Admin</Text>
                  <Text style={styles.a4SignSub}>Authorized Signature</Text>
                </View>
              )}
            </View>

            {/* Right section: Totals Grid */}
            <View style={{ flex: 1 }}>
              <View style={styles.a4TotalsTable}>
                <View style={styles.a4TotalRow}>
                  <Text style={styles.a4TotalLabel}>Gross</Text>
                  <Text style={styles.a4TotalVal}>Rp 156.000</Text>
                </View>
                <View style={styles.a4TotalRow}>
                  <Text style={styles.a4TotalLabel}>Discount</Text>
                  <Text style={styles.a4TotalVal}>Rp 0</Text>
                </View>
                <View style={[styles.a4TotalRow, styles.a4GrandTotalRow]}>
                  <Text style={styles.a4TotalLabel}>Grand Total</Text>
                  <Text style={styles.a4TotalVal}>Rp 156.000</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Footer terms */}
          {layout.showFooter && (
            <View style={styles.a4FooterTerms}>
              <Text style={styles.a4TermsText}>{layout.footerTerms}</Text>
            </View>
          )}
        </View>
      );
    } else if (layout.layoutType === 'FAKTUR_NCR') {
      return (
        <View style={styles.a4Preview}>
          {/* Header Box */}
          {layout.showHeader && (
            <View style={[styles.rowBetween, styles.previewA4Header, { borderBottomWidth: 1, borderColor: '#000' }]}>
              <View>
                <Text style={styles.a4StoreName}>TB MASDAR UTAMA</Text>
                <Text style={styles.a4StoreAddr}>Jl. Poros Maros - Pangkep</Text>
                <Text style={styles.a4StorePhone}>Phone: 6285398346677</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.a4DocType}>FAKTUR NCR</Text>
                <Text style={styles.a4DocNo}>INV/20260524-0001</Text>
                <Text style={styles.a4Meta}>Date: 24/05/2026</Text>
                <Text style={styles.a4Meta}>Pay: CASH</Text>
              </View>
            </View>
          )}

          {/* Customer Info Box */}
          {layout.showCustomerInfo && (
            <View style={[styles.a4CustCard, { borderWidth: 1, borderColor: '#000', borderRadius: 0 }]}>
              <Text style={[styles.a4CustTitle, { borderBottomWidth: 1, borderColor: '#000' }]}>CUSTOMER INFO</Text>
              <Text style={styles.a4CustName}>Nama: Umum</Text>
              <Text style={styles.a4CustAddr}>Address: -</Text>
            </View>
          )}

          {/* High legibility A4 Product Table */}
          <View style={[styles.a4Table, { borderWidth: 0, marginTop: 10 }]}>
            <View style={[styles.rowBetween, styles.a4TableHead, { backgroundColor: 'transparent', borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#000' }]}>
              <Text style={[styles.a4Th, { flex: 0.3 }]}>No</Text>
              <Text style={[styles.a4Th, { flex: 2, textAlign: 'left', paddingLeft: 4 }]}>Description</Text>
              <Text style={styles.a4Th}>Qty</Text>
              <Text style={styles.a4Th}>Price</Text>
              <Text style={styles.a4Th}>Net</Text>
            </View>
            <View style={[styles.rowBetween, styles.a4TableRow, { borderBottomWidth: 0 }]}>
              <Text style={[styles.a4Td, { flex: 0.3 }]}>1</Text>
              <Text style={[styles.a4Td, { flex: 2, textAlign: 'left', fontWeight: 'bold', paddingLeft: 4 }]}>A PLUS Pink</Text>
              <Text style={styles.a4Td}>2 Zak</Text>
              <Text style={styles.a4Td}>Rp 78k</Text>
              <Text style={[styles.a4Td, { fontWeight: 'bold' }]}>Rp 156k</Text>
            </View>
          </View>

          {/* Bottom details Row */}
          <View style={[styles.rowBetween, { marginTop: 8, alignItems: 'flex-start' }]}>
            {/* Left section: Terbilang, Bank transfer, signature */}
            <View style={{ flex: 1.3, gap: Spacing.xs }}>
              <View style={[styles.a4MiniTerbilang, { borderWidth: 1, borderRadius: 0, backgroundColor: 'transparent' }]}>
                <Text style={styles.a4TerbilangTxt}><Text style={{ fontWeight: 'bold' }}>Terbilang:</Text> Seratus Lima Puluh Enam Ribu Rupiah</Text>
              </View>
              {layout.showPaymentInfo && (
                <View style={[styles.a4MiniBank, { borderWidth: 1, borderRadius: 0, backgroundColor: 'transparent', borderStyle: 'solid' }]}>
                  <Text style={styles.a4BankTxt}><Text style={{ fontWeight: 'bold' }}>TRANSFER:</Text> {layout.bankName} - {layout.bankAccount}</Text>
                  <Text style={styles.a4BankTxt}>a/n {layout.bankHolder}</Text>
                </View>
              )}
              {layout.showSignature && (
                <View style={{ marginTop: 15 }}>
                  <Text style={styles.a4SignTitle}>Super Admin</Text>
                  <Text style={styles.a4SignSub}>Authorized Signature</Text>
                </View>
              )}
            </View>

            {/* Right section: Totals Grid */}
            <View style={{ flex: 1 }}>
              <View style={[styles.a4TotalsTable, { borderWidth: 1, borderColor: '#000' }]}>
                <View style={styles.a4TotalRow}>
                  <Text style={styles.a4TotalLabel}>Gross</Text>
                  <Text style={styles.a4TotalVal}>Rp 156.000</Text>
                </View>
                <View style={styles.a4TotalRow}>
                  <Text style={styles.a4TotalLabel}>Discount</Text>
                  <Text style={styles.a4TotalVal}>Rp 0</Text>
                </View>
                <View style={[styles.a4TotalRow, styles.a4GrandTotalRow, { backgroundColor: 'transparent', borderTopWidth: 1, borderColor: '#000' }]}>
                  <Text style={styles.a4TotalLabel}>Grand Total</Text>
                  <Text style={styles.a4TotalVal}>Rp 156.000</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Footer terms */}
          {layout.showFooter && (
            <View style={styles.a4FooterTerms}>
              <Text style={styles.a4TermsText}>{layout.footerTerms}</Text>
            </View>
          )}
        </View>
      );
    }
    return null;
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>DESAIN & LAYOUT INVOICE</Text>
        <TouchableOpacity onPress={handleReset} style={styles.resetBtn}>
          <Ionicons name="refresh-outline" size={20} color={Colors.error} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        
        {/* REAL-TIME LIVE PREVIEW SECTION */}
        <Text style={styles.sectionTitle}>Real-Time Preview Struk</Text>
        <View style={styles.previewWrapper}>
          <View style={[styles.previewCard, Shadow.card]}>
            {renderPreviewMockup()}
          </View>
        </View>

        {/* CONTROLS SECTION */}
        <Text style={styles.sectionTitle}>Pengaturan Desain & Layout</Text>

        {/* 1. Tipe Template */}
        <GlassCard padding={16} style={styles.controlGroup}>
          <Text style={styles.controlLabel}>Jenis Template Struk</Text>
          <View style={styles.tabsContainer}>
            {([
              { key: 'STRUK_KECIL', label: 'Struk Thermal' },
              { key: 'INVOICE_BESAR', label: 'Invoice A4' },
              { key: 'SURAT_JALAN', label: 'Surat Jalan' },
              { key: 'FAKTUR_NCR', label: 'Faktur NCR' },
            ] as const).map((tab) => (
              <TouchableOpacity
                key={tab.key}
                style={[
                  styles.tabButton,
                  layout.layoutType === tab.key && styles.tabButtonActive,
                ]}
                onPress={() => layout.updateLayout({ layoutType: tab.key })}
              >
                <Text
                  style={[
                    styles.tabButtonText,
                    layout.layoutType === tab.key && styles.tabButtonTextActive,
                  ]}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </GlassCard>

        {/* 2. Toggles Visibilitas */}
        <GlassCard padding={0} style={styles.controlGroup}>
          <View style={styles.switchRow}>
            <View>
              <Text style={styles.switchLabel}>Tampilkan Header Toko</Text>
              <Text style={styles.switchDesc}>Nama, alamat, telp di bagian atas</Text>
            </View>
            <Switch
              value={layout.showHeader}
              onValueChange={(val) => layout.updateLayout({ showHeader: val })}
              trackColor={{ false: Colors.border, true: Colors.primaryStart }}
              thumbColor="#fff"
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.switchRow}>
            <View>
              <Text style={styles.switchLabel}>Tampilkan Info Pelanggan</Text>
              <Text style={styles.switchDesc}>Nama dan nomor HP pelanggan</Text>
            </View>
            <Switch
              value={layout.showCustomerInfo}
              onValueChange={(val) => layout.updateLayout({ showCustomerInfo: val })}
              trackColor={{ false: Colors.border, true: Colors.primaryStart }}
              thumbColor="#fff"
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.switchRow}>
            <View>
              <Text style={styles.switchLabel}>Tampilkan Rekening Transfer</Text>
              <Text style={styles.switchDesc}>Informasi pembayaran via bank transfer</Text>
            </View>
            <Switch
              value={layout.showPaymentInfo}
              onValueChange={(val) => layout.updateLayout({ showPaymentInfo: val })}
              trackColor={{ false: Colors.border, true: Colors.primaryStart }}
              thumbColor="#fff"
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.switchRow}>
            <View>
              <Text style={styles.switchLabel}>Tampilkan Tanda Tangan</Text>
              <Text style={styles.switchDesc}>Kolom persetujuan di akhir invoice</Text>
            </View>
            <Switch
              value={layout.showSignature}
              onValueChange={(val) => layout.updateLayout({ showSignature: val })}
              trackColor={{ false: Colors.border, true: Colors.primaryStart }}
              thumbColor="#fff"
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.switchRow}>
            <View>
              <Text style={styles.switchLabel}>Tampilkan Ketentuan / Footer</Text>
              <Text style={styles.switchDesc}>Catatan kaki di baris paling bawah</Text>
            </View>
            <Switch
              value={layout.showFooter}
              onValueChange={(val) => layout.updateLayout({ showFooter: val })}
              trackColor={{ false: Colors.border, true: Colors.primaryStart }}
              thumbColor="#fff"
            />
          </View>
        </GlassCard>

        {/* 3. Teks Dinamis */}
        {layout.showPaymentInfo && (
          <GlassCard padding={16} style={styles.controlGroup}>
            <Text style={styles.formGroupTitle}>Data Rekening Transfer</Text>
            
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Nama Bank</Text>
              <TextInput
                style={styles.textInput}
                value={layout.bankName}
                onChangeText={(val) => layout.updateLayout({ bankName: val })}
                placeholder="Misal: BRI, BCA, Mandiri"
                placeholderTextColor={Colors.textTertiary}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Nomor Rekening</Text>
              <TextInput
                style={styles.textInput}
                value={layout.bankAccount}
                onChangeText={(val) => layout.updateLayout({ bankAccount: val })}
                placeholder="Masukkan No Rekening"
                placeholderTextColor={Colors.textTertiary}
                keyboardType="numeric"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Nama Pemilik Rekening</Text>
              <TextInput
                style={styles.textInput}
                value={layout.bankHolder}
                onChangeText={(val) => layout.updateLayout({ bankHolder: val })}
                placeholder="Masukkan nama pemilik"
                placeholderTextColor={Colors.textTertiary}
              />
            </View>
          </GlassCard>
        )}

        {layout.showFooter && (
          <GlassCard padding={16} style={styles.controlGroup}>
            <Text style={styles.formGroupTitle}>Ketentuan Footer / Syarat & Ketentuan</Text>
            <TextInput
              style={[styles.textInput, { height: 72, textAlignVertical: 'top', paddingTop: 10 }]}
              value={layout.footerTerms}
              onChangeText={(val) => layout.updateLayout({ footerTerms: val })}
              placeholder="Tulis ketentuan retur, penukaran, dll."
              placeholderTextColor={Colors.textTertiary}
              multiline
            />
          </GlassCard>
        )}

        {/* FontSize Selector */}
        <GlassCard padding={16} style={styles.controlGroup}>
          <Text style={styles.formGroupTitle}>Ukuran Font Cetak ({layout.fontSizeScale.toFixed(1)}x)</Text>
          <View style={styles.rowBetween}>
            <TouchableOpacity
              onPress={() => layout.updateLayout({ fontSizeScale: Math.max(0.6, layout.fontSizeScale - 0.1) })}
              style={styles.scaleBtn}
            >
              <Ionicons name="remove-circle-outline" size={24} color={Colors.primaryStart} />
            </TouchableOpacity>
            <Text style={{ fontWeight: 'bold', fontSize: FontSize.md }}>Skala Ukuran</Text>
            <TouchableOpacity
              onPress={() => layout.updateLayout({ fontSizeScale: Math.min(1.6, layout.fontSizeScale + 0.1) })}
              style={styles.scaleBtn}
            >
              <Ionicons name="add-circle-outline" size={24} color={Colors.primaryStart} />
            </TouchableOpacity>
          </View>
        </GlassCard>

        {/* Action button */}
        <View style={{ marginTop: Spacing.md, marginBottom: Spacing['3xl'] }}>
          <GradientButton title="Simpan Semua Pengaturan" onPress={handleSave} variant="primary" fullWidth />
        </View>

      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 64,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.lg,
  },
  backBtn: {
    padding: 4,
  },
  resetBtn: {
    padding: 4,
  },
  headerTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    letterSpacing: 0.5,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: Spacing.lg,
  },
  sectionTitle: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: Spacing.sm,
    marginTop: Spacing.sm,
    marginLeft: 4,
  },
  // ─── Control Group ───
  controlGroup: {
    marginBottom: Spacing.lg,
  },
  controlLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: BorderRadius.md,
    padding: 2,
    gap: 2,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: BorderRadius.sm,
  },
  tabButtonActive: {
    backgroundColor: '#FFFFFF',
    ...Shadow.sm,
  },
  tabButtonText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  tabButtonTextActive: {
    color: Colors.primaryStart,
    fontWeight: FontWeight.bold,
  },
  // ─── Switch Row ───
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  switchLabel: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  switchDesc: {
    fontSize: 10,
    color: Colors.textTertiary,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginLeft: Spacing.lg,
  },
  // ─── Form Group ───
  formGroupTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
  },
  inputGroup: {
    marginBottom: Spacing.md,
  },
  inputLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: Colors.textTertiary,
    marginBottom: Spacing.xs,
  },
  textInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    height: 46,
    paddingHorizontal: Spacing.md,
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
  },
  scaleBtn: {
    padding: 6,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  // ─── Real-Time Preview Styles ───
  previewWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xl,
  },
  previewCard: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
    overflow: 'hidden',
  },
  // ─── Thermal Receipt Mockup ───
  thermalPreview: {
    padding: Spacing.lg,
    backgroundColor: '#FFFFFF',
  },
  previewCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewTitle: {
    fontWeight: 'bold',
    color: '#000',
  },
  previewSubtitle: {
    fontStyle: 'italic',
    color: '#4B5563',
    marginTop: 2,
  },
  previewAddr: {
    color: '#6B7280',
    marginTop: 2,
  },
  dottedDivider: {
    borderWidth: 0.5,
    borderColor: '#9CA3AF',
    borderStyle: 'dashed',
    marginVertical: Spacing.sm,
  },
  previewText: {
    color: '#374151',
    lineHeight: 1.3,
  },
  previewItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  previewItemName: {
    fontWeight: 'bold',
    color: '#000',
  },
  previewItemDetail: {
    color: '#6B7280',
    marginTop: 1,
  },
  previewItemPrice: {
    fontWeight: 'bold',
    color: '#000',
  },
  previewLabel: {
    color: '#4B5563',
  },
  previewVal: {
    color: '#000',
  },
  previewBankBox: {
    marginTop: Spacing.sm,
    backgroundColor: '#F3F4F6',
    borderRadius: BorderRadius.sm,
    padding: 6,
    alignItems: 'center',
  },
  previewBankTitle: {
    fontSize: 8.5,
    fontWeight: 'bold',
    color: '#111827',
  },
  previewBankNo: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#1F2937',
    marginTop: 1,
  },
  previewBankName: {
    fontSize: 8.5,
    color: '#4B5563',
  },
  previewFooterText: {
    color: '#9CA3AF',
    fontWeight: '500',
  },
  // ─── A4 / Invoice / Surat Jalan Mockups ───
  a4Preview: {
    padding: Spacing.md,
    backgroundColor: '#FFFFFF',
  },
  previewA4Header: {
    borderBottomWidth: 1.5,
    borderColor: '#000000',
    paddingBottom: 8,
    alignItems: 'flex-start',
  },
  a4StoreName: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#000',
  },
  a4StoreAddr: {
    fontSize: 8,
    color: '#4B5563',
    marginTop: 2,
    maxWidth: 160,
  },
  a4StorePhone: {
    fontSize: 8,
    color: '#4B5563',
  },
  a4DocType: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#000',
    letterSpacing: 0.5,
  },
  a4DocNo: {
    fontSize: 8.5,
    fontWeight: 'bold',
    color: '#000',
    marginTop: 2,
  },
  a4Meta: {
    fontSize: 8,
    color: '#4B5563',
  },
  a4CustCard: {
    borderWidth: 0.8,
    borderColor: '#000',
    padding: 6,
    marginTop: 8,
  },
  a4CustTitle: {
    fontSize: 8,
    fontWeight: 'bold',
    borderBottomWidth: 0.5,
    borderColor: '#000',
    paddingBottom: 2,
    marginBottom: 4,
  },
  a4CustName: {
    fontSize: 8.5,
    fontWeight: 'bold',
    color: '#000',
  },
  a4CustAddr: {
    fontSize: 8,
    color: '#4B5563',
  },
  a4Table: {
    marginTop: 8,
    borderWidth: 0.8,
    borderColor: '#000',
  },
  a4TableHead: {
    backgroundColor: '#E5E7EB',
    borderBottomWidth: 0.8,
    borderColor: '#000',
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  a4Th: {
    fontSize: 8,
    fontWeight: 'bold',
    color: '#000',
    textAlign: 'center',
    flex: 1,
  },
  a4TableRow: {
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  a4Td: {
    fontSize: 8,
    color: '#000',
    textAlign: 'center',
    flex: 1,
  },
  a4MiniTerbilang: {
    borderWidth: 0.5,
    borderColor: '#000',
    padding: 4,
    backgroundColor: '#F9FAFB',
  },
  a4TerbilangTxt: {
    fontSize: 7.5,
    color: '#000',
  },
  a4MiniBank: {
    borderWidth: 0.5,
    borderStyle: 'dashed',
    borderColor: '#000',
    padding: 4,
    backgroundColor: '#F3F4F6',
    marginTop: 4,
  },
  a4BankTxt: {
    fontSize: 7.5,
    color: '#000',
  },
  a4SignTitle: {
    fontSize: 8.5,
    fontWeight: 'bold',
    textDecorationLine: 'underline',
    color: '#000',
  },
  a4SignSub: {
    fontSize: 7,
    color: '#6B7280',
    marginTop: 1,
  },
  a4TotalsTable: {
    borderWidth: 0.8,
    borderColor: '#000',
  },
  a4TotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderBottomWidth: 0.5,
    borderColor: '#000',
  },
  a4TotalLabel: {
    fontSize: 8,
    fontWeight: '600',
  },
  a4TotalVal: {
    fontSize: 8,
    fontWeight: 'bold',
  },
  a4GrandTotalRow: {
    backgroundColor: '#E5E7EB',
  },
  a4FooterTerms: {
    borderTopWidth: 1.5,
    borderColor: '#000',
    marginTop: 10,
    paddingTop: 4,
    alignItems: 'center',
  },
  a4TermsText: {
    fontSize: 6.5,
    fontWeight: 'bold',
    color: '#000',
    textAlign: 'center',
  },
  // Surat Jalan Mockup
  a4SignBox: {
    width: '28%',
    alignItems: 'center',
  },
  a4SignLabel: {
    fontSize: 8.5,
    color: '#000',
  },
  a4SignLine: {
    width: '100%',
    borderTopWidth: 0.8,
    borderColor: '#000',
    marginTop: 35,
  },
});

export default InvoiceLayoutScreen;

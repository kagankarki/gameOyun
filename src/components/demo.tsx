import ResponsiveHeroBanner from './ui/responsive-hero-banner';
import { useAuth } from '@/context/AuthContext';

/**
 * Açılış sayfasının tam ekran kahraman bölümü.
 *
 * Butonlar oturuma göre değişir: giriş yapmış birini tekrar giriş
 * sayfasına yollamak yerine doğrudan gideceği yere götürüyoruz.
 */
const HeroDemo = () => {
    const { user, isTeacher } = useAuth();

    const primaryText = user ? (isTeacher ? 'Panelime Git' : 'Derse Katıl') : 'Öğrenci Girişi';
    const primaryHref = user ? (isTeacher ? '/hoca' : '/dersler') : '/giris';

    return (
        <ResponsiveHeroBanner
            backgroundVideoUrl="/video2.mp4"
            badgeLabel="Yeni"
            badgeText="İnteraktif Anatomi Dersleri Başladı"
            title="Hatayı Yakala"
            titleLine2="Dersi Denetleyen Sen Ol"
            description="Hoca derste bilinçli olarak yanlış bilgi verir. Sen hatayı duyduğun anda işaretleyip ne olduğunu yazarsın. Pasif dinleyici olmaktan çık, dersin aktif bir parçası ol."
            primaryButtonText={primaryText}
            primaryButtonHref={primaryHref}
            secondaryButtonText="Nasıl Oynanır?"
            secondaryButtonHref="#nasil-oynanir"
            // Hoca girişi bilinçli olarak sönük: sayfayı gören 150 kişiden
            // 149'u öğrenci, hoca yalnızca kendi bağlantısını arıyor.
            tertiaryButtonText={user ? '' : 'Öğretim üyesi misin? Hoca girişi →'}
            tertiaryButtonHref="/giris?rol=teacher"
            partnersTitle="Gazi Üniversitesi × Prof. Dr. Tuncay Peker × Doç. Dr. Ayşe Soylu × Kağan Karkı"
            partners={[]}
        />
    );
};

export default HeroDemo;



export const TAROT_DECK = [
  "愚者", "魔术师", "女祭司", "皇后", "皇帝",
  "教皇", "恋人", "战车", "力量", "隐士",
  "命运之轮", "正义", "倒吊人", "死神", "节制",
  "恶魔", "高塔", "星星", "月亮", "太阳",
  "审判", "世界",
  "权杖一", "权杖二", "权杖三", "权杖四", "权杖五", "权杖六", "权杖七", "权杖八", "权杖九", "权杖十", "权杖侍从", "权杖骑士", "权杖王后", "权杖国王",
  "圣杯一", "圣杯二", "圣杯三", "圣杯四", "圣杯五", "圣杯六", "圣杯七", "圣杯八", "圣杯九", "圣杯十", "圣杯侍从", "圣杯骑士", "圣杯王后", "圣杯国王",
  "宝剑一", "宝剑二", "宝剑三", "宝剑四", "宝剑五", "宝剑六", "宝剑七", "宝剑八", "宝剑九", "宝剑十", "宝剑侍从", "宝剑骑士", "宝剑王后", "宝剑国王",
  "星币一", "星币二", "星币三", "星币四", "星币五", "星币六", "星币七", "星币八", "星币九", "星币十", "星币侍从", "星币骑士", "星币王后", "星币国王"
];

export const TOTAL_CARDS = TAROT_DECK.length;

export const BACK_COLOR = "#1a1a1a";
export const BACK_ACCENT = "#d4af37"; // Gold
export const CARD_RATIO = 1.71; // Standard Tarot Ratio

// ==========================================
//  自定义图片上传指南 (CUSTOM IMAGE UPLOAD GUIDE)
// ==========================================
// 如果你想使用自己的高清塔罗牌图片，请按以下步骤操作：
// 1. 准备 78 张塔罗牌图片（JPG 或 PNG）。
// 2. 将它们重命名为全小写，并用下划线连接，例如：
//    - "The Fool" -> "the_fool.jpg"
//    - "Ace of Wands" -> "ace_of_wands.jpg"
//    - "Queen of Cups" -> "queen_of_cups.jpg"
// 3. 将这些图片上传到一个支持公开访问的云存储（推荐：GitHub Pages, Vercel Blob, Amazon S3, 或 Imgur 图床）。
// 4. 获取图片所在的文件夹的基础 URL。
// 5. 将下方的 BASE_IMAGE_URL 替换为你自己的 URL。
// ==========================================

/**
 * Rider-Waite-Smith card art is bundled locally under public/cards.
 * Image files are sourced from https://github.com/michmitz/terminal-tarot (MIT License).
 * This keeps the cards consistent and avoids flaky external CDNs.
 */
const CARD_IMAGE_MAP: Record<string, string> = {
  "愚者": "00-TheFool.jpg",
  "魔术师": "01-TheMagician.jpg",
  "女祭司": "02-TheHighPriestess.jpg",
  "皇后": "03-TheEmpress.jpg",
  "皇帝": "04-TheEmperor.jpg",
  "教皇": "05-TheHierophant.jpg",
  "恋人": "06-TheLovers.jpg",
  "战车": "07-TheChariot.jpg",
  "力量": "08-Strength.jpg",
  "隐士": "09-TheHermit.jpg",
  "命运之轮": "10-WheelOfFortune.jpg",
  "正义": "11-Justice.jpg",
  "倒吊人": "12-TheHangedMan.jpg",
  "死神": "13-Death.jpg",
  "节制": "14-Temperance.jpg",
  "恶魔": "15-TheDevil.jpg",
  "高塔": "16-TheTower.jpg",
  "星星": "17-TheStar.jpg",
  "月亮": "18-TheMoon.jpg",
  "太阳": "19-TheSun.jpg",
  "审判": "20-Judgement.jpg",
  "世界": "21-TheWorld.jpg",
  "权杖一": "Wands01.jpg",
  "权杖二": "Wands02.jpg",
  "权杖三": "Wands03.jpg",
  "权杖四": "Wands04.jpg",
  "权杖五": "Wands05.jpg",
  "权杖六": "Wands06.jpg",
  "权杖七": "Wands07.jpg",
  "权杖八": "Wands08.jpg",
  "权杖九": "Wands09.jpg",
  "权杖十": "Wands10.jpg",
  "权杖侍从": "Wands11.jpg",
  "权杖骑士": "Wands12.jpg",
  "权杖王后": "Wands13.jpg",
  "权杖国王": "Wands14.jpg",
  "圣杯一": "Cups01.jpg",
  "圣杯二": "Cups02.jpg",
  "圣杯三": "Cups03.jpg",
  "圣杯四": "Cups04.jpg",
  "圣杯五": "Cups05.jpg",
  "圣杯六": "Cups06.jpg",
  "圣杯七": "Cups07.jpg",
  "圣杯八": "Cups08.jpg",
  "圣杯九": "Cups09.jpg",
  "圣杯十": "Cups10.jpg",
  "圣杯侍从": "Cups11.jpg",
  "圣杯骑士": "Cups12.jpg",
  "圣杯王后": "Cups13.jpg",
  "圣杯国王": "Cups14.jpg",
  "宝剑一": "Swords01.jpg",
  "宝剑二": "Swords02.jpg",
  "宝剑三": "Swords03.jpg",
  "宝剑四": "Swords04.jpg",
  "宝剑五": "Swords05.jpg",
  "宝剑六": "Swords06.jpg",
  "宝剑七": "Swords07.jpg",
  "宝剑八": "Swords08.jpg",
  "宝剑九": "Swords09.jpg",
  "宝剑十": "Swords10.jpg",
  "宝剑侍从": "Swords11.jpg",
  "宝剑骑士": "Swords12.jpg",
  "宝剑王后": "Swords13.jpg",
  "宝剑国王": "Swords14.jpg",
  "星币一": "Pentacles01.jpg",
  "星币二": "Pentacles02.jpg",
  "星币三": "Pentacles03.jpg",
  "星币四": "Pentacles04.jpg",
  "星币五": "Pentacles05.jpg",
  "星币六": "Pentacles06.jpg",
  "星币七": "Pentacles07.jpg",
  "星币八": "Pentacles08.jpg",
  "星币九": "Pentacles09.jpg",
  "星币十": "Pentacles10.jpg",
  "星币侍从": "Pentacles11.jpg",
  "星币骑士": "Pentacles12.jpg",
  "星币王后": "Pentacles13.jpg",
  "星币国王": "Pentacles14.jpg"
};

export const getCardImage = (cardName: string): string => {
  const filename = CARD_IMAGE_MAP[cardName];
  if (!filename) {
    console.warn(`Image not found for card: ${cardName}`);
    return "/card_bg.jpg"; // Fallback to card back
  }
  return `/cards/${filename}`;
};

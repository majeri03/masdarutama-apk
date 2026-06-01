import { Product } from '../types';

/**
 * Algoritma Fuzzy Matcher sederhana untuk mencari produk 
 * berdasarkan kata kunci yang berantakan dari AI.
 */
export const findProductByKeyword = (products: Product[], keyword: string): Product | null => {
    if (!keyword) return null;
    const searchTerms = keyword.toLowerCase().split(' ');

    let bestMatch: Product | null = null;
    let highestScore = 0;

    for (const product of products) {
        let score = 0;
        const productName = product.name.toLowerCase();

        for (const term of searchTerms) {
            if (productName.includes(term)) {
                score += 1;
            }
        }

        // Jika skor lebih tinggi dari sebelumnya, jadikan kandidat terbaik
        if (score > highestScore) {
            highestScore = score;
            bestMatch = product;
        }
    }

    // Toleransi kemiripan: skor harus lebih dari 0 agar tidak asal pilih
    return highestScore > 0 ? bestMatch : null;
};
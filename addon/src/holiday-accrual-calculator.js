// src/holiday-accrual-calculator.js
// Calculates accrued holidays based on site-specific rules

/**
 * Base class for holiday accrual calculations
 * Handles common date logic and provides extension points for site-specific rules
 */
class BaseHolidayAccrualCalculator {
    constructor() {
        this.today = new Date();
        this.utcToday = new Date(Date.UTC(
            this.today.getUTCFullYear(), 
            this.today.getUTCMonth(), 
            this.today.getUTCDate()
        ));
    }

    /**
     * Gets the current accrual year start date (September 1st)
     * Handles DST by using UTC dates
     */
    getCurrentAccrualYearStart() {
        const currentYear = this.today.getUTCFullYear();
        const septemberFirst = new Date(Date.UTC(currentYear, 8, 1)); // September is month 8 (0-based)
        
        // If we're before September 1st, use previous year's September 1st
        const referenceDate = this.utcToday < septemberFirst ? 
            new Date(Date.UTC(currentYear - 1, 8, 1)) : 
            new Date(Date.UTC(currentYear, 8, 1));
        
        return referenceDate;
    }

    /**
     * Calculates complete months passed since current accrual year started
     * Accrual happens at the END of each month, so only count completed months
     * 
     * Examples:
     * - Sep 1st to Sep 29th = 0 months completed
     * - Sep 30th to Oct 30th = 1 month completed (September finished)
     * - Oct 31st to Nov 30th = 2 months completed (Sep + Oct finished)
     */
    getMonthsPassedInAccrualYear() {
        const accrualYearStart = this.getCurrentAccrualYearStart();
        
        // Get the first day of the current month
        const currentMonthStart = new Date(Date.UTC(
            this.utcToday.getUTCFullYear(), 
            this.utcToday.getUTCMonth(), 
            1
        ));
        
        // Calculate months from accrual start to the beginning of current month
        const monthsToCurrentMonth = (currentMonthStart.getUTCFullYear() - accrualYearStart.getUTCFullYear()) * 12 + 
                                   (currentMonthStart.getUTCMonth() - accrualYearStart.getUTCMonth());
        
        // If we're at the end of the current month (30th or 31st), that month is completed
        const lastDayOfCurrentMonth = new Date(Date.UTC(
            this.utcToday.getUTCFullYear(), 
            this.utcToday.getUTCMonth() + 1, 
            0
        )).getUTCDate();
        
        const currentDay = this.utcToday.getUTCDate();
        const isMonthEnd = currentDay === lastDayOfCurrentMonth;
        
        // If we're at month end, count the current month as completed
        return Math.max(0, monthsToCurrentMonth + (isMonthEnd ? 1 : 0));
    }

    /**
     * Abstract method - must be implemented by site-specific calculators
     * @param {number} monthsPassed - Months passed in current accrual year
     * @returns {number} - Accrued holiday days
     */
    calculateAccruedDays(monthsPassed) {
        throw new Error('calculateAccruedDays must be implemented by subclass');
    }

    /**
     * Gets the total accrued holidays for current date
     */
    getTotalAccruedDays() {
        const monthsPassed = this.getMonthsPassedInAccrualYear();
        return this.calculateAccruedDays(monthsPassed);
    }
}

/**
 * ERL site holiday accrual calculator
 * 2.5 days per month, 30 days maximum per year
 */
class ERLHolidayAccrualCalculator extends BaseHolidayAccrualCalculator {
    calculateAccruedDays(monthsPassed) {
        // 2.5 days per month, maximum 30 days per year
        const accruedDays = Math.min(30, monthsPassed * 2.5);
        // Round to 2 decimal places to avoid floating point issues
        return Math.round(accruedDays * 100) / 100;
    }
}

/**
 * LY site holiday accrual calculator
 * - 5 bulk days added at Sep 1st (special days that expire if not used by next Sep 1st)
 * - 2.08 days per completed month (25 days maximum per year)
 */
class LYHolidayAccrualCalculator extends BaseHolidayAccrualCalculator {
    calculateAccruedDays(monthsPassed) {
        // 5 bulk days are added immediately at Sep 1st (start of accrual year)
        const bulkDays = 5;
        
        // 2.08 days per completed month, maximum 25 days per year from monthly accrual
        const monthlyAccruedDays = Math.min(25, monthsPassed * 2.08);
        
        // Total accrued = bulk days + monthly accrued days
        const totalAccruedDays = bulkDays + monthlyAccruedDays;
        
        // Round to 2 decimal places to avoid floating point issues
        return Math.round(totalAccruedDays * 100) / 100;
    }
    
    /**
     * Gets breakdown of LY accrual for debugging/reporting
     * @returns {Object} - Breakdown of bulk vs monthly accrued days
     */
    getAccrualBreakdown() {
        const monthsPassed = this.getMonthsPassedInAccrualYear();
        const bulkDays = 5;
        const monthlyAccruedDays = Math.min(25, monthsPassed * 2.08);
        const totalDays = bulkDays + monthlyAccruedDays;
        
        return {
            bulkDays,
            monthlyAccruedDays: Math.round(monthlyAccruedDays * 100) / 100,
            monthsPassed,
            totalDays: Math.round(totalDays * 100) / 100
        };
    }
}

/**
 * Factory function to get the appropriate calculator for a site
 * @param {string} site - Site code (LY, ERL, etc.)
 * @returns {BaseHolidayAccrualCalculator} - Calculator instance
 */
export function createHolidayAccrualCalculator(site) {
    switch (site?.toUpperCase()) {
        case 'ERL':
            return new ERLHolidayAccrualCalculator();
        case 'LY':
            return new LYHolidayAccrualCalculator();
        default:
            // Default to ERL rules if site is unknown
            console.warn(`Unknown site '${site}', defaulting to ERL rules`);
            return new ERLHolidayAccrualCalculator();
    }
}

/**
 * Calculates total available holidays for a person
 * @param {Object} person - Person object with site and carry_over_holidays
 * @returns {number} - Total available holidays (carry-over + accrued)
 */
export function calculateTotalAvailableHolidays(person) {
    const carryOver = person.carry_over_holidays || 0;
    const site = person.site || 'LY';
    
    const calculator = createHolidayAccrualCalculator(site);
    const accruedDays = calculator.getTotalAccruedDays();
    
    return Math.round((carryOver + accruedDays) * 100) / 100;
}

/**
 * Gets detailed holiday information for a person
 * @param {Object} person - Person object
 * @returns {Object} - Detailed breakdown of holidays
 */
export function getHolidayBreakdown(person) {
    const carryOver = person.carry_over_holidays || 0;
    const site = person.site || 'LY';
    
    const calculator = createHolidayAccrualCalculator(site);
    const accruedDays = calculator.getTotalAccruedDays();
    const monthsPassed = calculator.getMonthsPassedInAccrualYear();
    const accrualYearStart = calculator.getCurrentAccrualYearStart();
    
    const breakdown = {
        carryOver,
        accruedDays,
        totalAvailable: Math.round((carryOver + accruedDays) * 100) / 100,
        site,
        monthsPassed: Math.round(monthsPassed * 100) / 100,
        accrualYearStart: accrualYearStart.toISOString().split('T')[0]
    };
    
    // Add LY-specific breakdown if applicable
    if (site?.toUpperCase() === 'LY' && calculator.getAccrualBreakdown) {
        breakdown.lyBreakdown = calculator.getAccrualBreakdown();
    }
    
    return breakdown;
}

/**
 * Calculates remaining holidays with site-specific formatting
 * @param {Object} person - Person object with site, carry_over_holidays, etc.
 * @param {number|Object} spentDays - Either total spent days (number) or object with breakdown
 * @returns {Object} - Remaining holidays information
 */
export function calculateRemainingHolidays(person, spentDays = 0) {
    const site = person.site || 'LY';
    const totalAvailable = calculateTotalAvailableHolidays(person);
    
    if (site?.toUpperCase() === 'ERL') {
        // ERL: Simple remaining calculation
        const totalSpent = typeof spentDays === 'object' ? (spentDays.total || 0) : spentDays;
        const remaining = Math.max(0, totalAvailable - totalSpent);
        
        return {
            site: 'ERL',
            totalRemaining: Math.round(remaining * 100) / 100,
            displayText: `${Math.round(remaining * 100) / 100}`,
            sortValue: remaining
        };
    } else {
        // LY: Split into special (bulk) and standard (monthly + carry-over) holidays
        const calculator = createHolidayAccrualCalculator('LY');
        const breakdown = calculator.getAccrualBreakdown ? calculator.getAccrualBreakdown() : null;
        
        if (breakdown) {
            const carryOver = person.carry_over_holidays || 0;
            const specialDays = breakdown.bulkDays; // 5 bulk days from Sep 1st
            const standardDays = carryOver + breakdown.monthlyAccruedDays; // carry-over + monthly accrued
            
            // Handle different spending patterns for LY sites
            let specialSpent = 0;
            let standardSpent = 0;
            
            if (typeof spentDays === 'object' && spentDays.extraHoliday !== undefined && spentDays.holiday !== undefined) {
                // Specific spending breakdown provided
                specialSpent = spentDays.extraHoliday || 0; // "Extra Holiday" comes from special days
                standardSpent = spentDays.holiday || 0;     // "Holiday" comes from standard days
            } else {
                // Fallback to simple spending (assume from standard first, then special)
                const totalSpent = typeof spentDays === 'object' ? (spentDays.total || 0) : spentDays;
                standardSpent = Math.min(standardDays, totalSpent);
                specialSpent = Math.max(0, totalSpent - standardDays);
            }
            
            const specialRemaining = Math.max(0, specialDays - specialSpent);
            const standardRemaining = Math.max(0, standardDays - standardSpent);
            
            return {
                site: 'LY',
                specialRemaining: Math.round(specialRemaining * 100) / 100,
                standardRemaining: Math.round(standardRemaining * 100) / 100,
                totalRemaining: Math.round((specialRemaining + standardRemaining) * 100) / 100,
                displayText: `${Math.round(specialRemaining * 100) / 100} / ${Math.round(standardRemaining * 100) / 100}`,
                sortValue: specialRemaining + standardRemaining
            };
        } else {
            // Fallback if breakdown is not available
            const totalSpent = typeof spentDays === 'object' ? (spentDays.total || 0) : spentDays;
            const remaining = Math.max(0, totalAvailable - totalSpent);
            return {
                site: 'LY',
                totalRemaining: Math.round(remaining * 100) / 100,
                displayText: `${Math.round(remaining * 100) / 100}`,
                sortValue: remaining
            };
        }
    }
}

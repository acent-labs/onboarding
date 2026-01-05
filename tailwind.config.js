/** @type {import('tailwindcss').Config} */
import tailwindcssAnimate from "tailwindcss-animate"
import tailwindcssTypography from "@tailwindcss/typography"

export default {
	darkMode: ["class"],
	content: [
		'./index.html',
		'./src/**/*.{ts,tsx}',
		'./pages/**/*.{ts,tsx}',
		'./components/**/*.{ts,tsx}',
	],
	prefix: "",
	theme: {
    	container: {
    		center: true,
    		padding: {
    			DEFAULT: '1rem',
    			sm: '1.5rem',
    			md: '2rem',
    			lg: '3rem',
    			xl: '4rem',
    			'2xl': '5rem'
    		},
    		screens: {
    			sm: '640px',
    			md: '768px',
    			lg: '1024px',
    			xl: '1200px',
    			'2xl': '1280px'
    		}
    	},
    	extend: {
    		colors: {
    			border: 'hsl(var(--border))',
    			input: 'hsl(var(--input))',
    			ring: 'hsl(var(--ring))',
    			background: 'hsl(var(--background))',
    			foreground: 'hsl(var(--foreground))',
    			primary: {
    				DEFAULT: 'hsl(var(--primary))',
    				foreground: 'hsl(var(--primary-foreground))'
    			},
    			secondary: {
    				DEFAULT: 'hsl(var(--secondary))',
    				foreground: 'hsl(var(--secondary-foreground))'
    			},
    			destructive: {
    				DEFAULT: 'hsl(var(--destructive))',
    				foreground: 'hsl(var(--destructive-foreground))'
    			},
    			muted: {
    				DEFAULT: 'hsl(var(--muted))',
    				foreground: 'hsl(var(--muted-foreground))'
    			},
    			accent: {
    				DEFAULT: 'hsl(var(--accent))',
    				foreground: 'hsl(var(--accent-foreground))'
    			},
    			popover: {
    				DEFAULT: 'hsl(var(--popover))',
    				foreground: 'hsl(var(--popover-foreground))'
    			},
    			card: {
    				DEFAULT: 'hsl(var(--card))',
    				foreground: 'hsl(var(--card-foreground))'
    			},
    			chart: {
    				'1': 'hsl(var(--chart-1))',
    				'2': 'hsl(var(--chart-2))',
    				'3': 'hsl(var(--chart-3))',
    				'4': 'hsl(var(--chart-4))',
    				'5': 'hsl(var(--chart-5))'
    			},
    			success: {
    				DEFAULT: 'hsl(var(--success))',
    				foreground: 'hsl(var(--success-foreground))'
    			},
    			warning: {
    				DEFAULT: 'hsl(var(--warning))',
    				foreground: 'hsl(var(--warning-foreground))'
    			},
    			info: {
    				DEFAULT: 'hsl(var(--info))',
    				foreground: 'hsl(var(--info-foreground))'
    			}
    		},
    		borderRadius: {
    			DEFAULT: 'var(--radius)',
    			xs: 'var(--radius-sm)',
    			sm: 'calc(var(--radius) - 4px)',
    			md: 'calc(var(--radius) - 2px)',
    			lg: 'var(--radius)',
    			xl: 'calc(var(--radius-lg) + 2px)',
    			'2xl': 'calc(var(--radius-lg) + 6px)',
    			'3xl': 'calc(var(--radius-lg) + 10px)',
    			full: '9999px'
    		},
    		backgroundImage: {
    			'grid-pattern': 'linear-gradient(to right, hsl(var(--primary) / 0.02) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--primary) / 0.02) 1px, transparent 1px)'
    		},
    		keyframes: {
    			'accordion-down': {
    				from: {
    					height: '0'
    				},
    				to: {
    					height: 'var(--radix-accordion-content-height)'
    				}
    			},
    			'accordion-up': {
    				from: {
    					height: 'var(--radix-accordion-content-height)'
    				},
    				to: {
    					height: '0'
    				}
    			}
    		},
    		animation: {
    			'accordion-down': 'accordion-down 0.2s ease-out',
    			'accordion-up': 'accordion-up 0.2s ease-out'
    		}
    	}
    },
	plugins: [
		tailwindcssAnimate,
		tailwindcssTypography
	],
}

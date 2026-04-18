<?php
/**
 * @package    HaruTheme
 * @version    1.0.0
 * @author     Administrator <admin@harutheme.com>
 * @copyright  Copyright 2022, HaruTheme
*/

 /*  Purpose: Register sidebar and add more custom sidebar via AJAX
 *   Files: theme-functions.php, haru-custom-sidebar.js, admin-style.css
 */

if ( ! function_exists( 'haru_register_sidebar' ) ) {
    function haru_register_sidebar() {
        register_sidebar( 
            array(
                'name'          => esc_html__( 'Sidebar Blog 1', 'pricom' ),
                'id'            => 'sidebar-1',
                'description'   => esc_html__( 'Widget Area 1 for Archive or Single Blog', 'pricom' ),
                'before_widget' => '<aside id="%1$s" class="widget %2$s">',
                'after_widget'  => '</aside>',
                'before_title'  => '<h4 class="widget-title"><span>',
                'after_title'   => '</span></h4>',
            ) 
        );

        register_sidebar( 
            array(
                'name'          => esc_html__( 'Sidebar Blog 2', 'pricom' ),
                'id'            => 'sidebar-2',
                'description'   => esc_html__( 'Widget Area 2 for Archive or Single Blog', 'pricom' ),
                'before_widget' => '<aside id="%1$s" class="widget %2$s">',
                'after_widget'  => '</aside>',
                'before_title'  => '<h4 class="widget-title"><span>',
                'after_title'   => '</span></h4>',
            ) 
        );

        register_sidebar( 
            array(
                'name'          => esc_html__( 'WooCommerce', 'pricom' ),
                'id'            => 'woocommerce',
                'description'   => esc_html__( 'WooCommerce Sidebar', 'pricom' ),
                'before_widget' => '<aside id="%1$s" class="widget %2$s">',
                'after_widget'  => '</aside>',
                'before_title'  => '<h4 class="widget-title"><span>',
                'after_title'   => '</span></h4>',
            ) 
        );

        if ( true == haru_check_core_plugin_status() ) {
            register_sidebar( 
                array(
                    'name'          => esc_html__( 'WooCommerce Ajax Filter', 'pricom' ),
                    'id'            => 'woocommerce_ajax_filter',
                    'description'   => esc_html__( 'WooCommerce Sidebar Ajax Filter', 'pricom' ),
                    'before_widget' => '<aside id="%1$s" class="widget %2$s">',
                    'after_widget'  => '</aside>',
                    'before_title'  => '<h4 class="widget-title"><span>',
                    'after_title'   => '</span></h4>',
                ) 
            );

            // Add custom sidebar using ajax
            $custom_sidebars = haru_get_custom_sidebars();

            if ( is_array( $custom_sidebars ) && ! empty( $custom_sidebars ) ) {
                foreach ( $custom_sidebars as $name ) {
                    $haru_custom_sidebars[] = array(
                        'name'          => '' . $name . '',
                        'id'            => sanitize_title( $name ),
                        'description'   => '',
                        'class'         => 'haru-custom-sidebar',
                        'before_widget' => '<section id="%1$s" class="widget-container %2$s">',
                        'after_widget'  => '</section>',
                        'before_title'  => '<div class="widget-title-wrapper"><a class="block-control" href="javascript:void(0)"></a><h3 class="widget-title heading-title">',
                        'after_title'   => '</h3></div>',
                    );
                }
                
                foreach ( $haru_custom_sidebars as $custom_sidebar ) {
                    register_sidebar( $custom_sidebar );
                }
            }
        }
    }

    add_action( 'widgets_init', 'haru_register_sidebar' );
}

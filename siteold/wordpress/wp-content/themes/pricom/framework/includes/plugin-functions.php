<?php
/**
 * @package    HaruTheme/Haru Pricom
 * @version    1.0.0
 * @author     Administrator <admin@harutheme.com>
 * @copyright  Copyright 2022, HaruTheme
*/

/* 
 * 1. Add/Delete Custom Sidebar functions
*/
if ( ! function_exists( 'haru_custom_sidebar_form' ) ) {
    function haru_custom_sidebar_form() {
    ?>
        <form action="<?php echo admin_url( 'widgets.php' ); ?>" method="post" id="haru-form-add-sidebar">
            <input type="text" name="sidebar_name" id="sidebar_name" placeholder="<?php echo esc_attr__( 'Enter Custom Sidebar Name', 'pricom' ); ?>" />
            <button class="button-primary" id="haru-add-sidebar"><?php echo esc_html__( 'Add Sidebar', 'pricom' ); ?></button>
        </form>
    <?php
    }

    add_action( 'sidebar_admin_page', 'haru_custom_sidebar_form' );
}


if ( ! function_exists( 'haru_get_custom_sidebars' ) ) {
    function haru_get_custom_sidebars() {
        $option_name = 'haru_custom_sidebars';

        return get_option( $option_name );
    }
}

if ( ! function_exists( 'haru_add_custom_sidebar' ) ) {
    function haru_add_custom_sidebar() {
        if ( isset( $_POST['sidebar_name'] ) ) {
            $option_name = 'haru_custom_sidebars';
            if ( ! get_option( $option_name ) || get_option( $option_name ) == '' ) {
                delete_option( $option_name );
            }
            
            $sidebar_name = $_POST['sidebar_name'];
            
            if ( get_option( $option_name ) ) {
                $custom_sidebars = haru_get_custom_sidebars();

                if ( !in_array($sidebar_name, $custom_sidebars) ) {
                    $custom_sidebars[] = $sidebar_name;
                }

                $result1 = update_option($option_name, $custom_sidebars);
            } else {
                $custom_sidebars[] = $sidebar_name;
                $result2 = add_option( $option_name, $custom_sidebars );
            }
            
            if ( $result1 ) {
                die( 'Updated' );
            } elseif ( $result2 ) {
                die( 'Added' );
            } else {
                die( 'Error' );
            }
        }

        die('');
    }

    add_action('wp_ajax_haru_add_custom_sidebar', 'haru_add_custom_sidebar');
}

if ( ! function_exists( 'haru_delete_custom_sidebar' ) ) {
    function haru_delete_custom_sidebar() {
        if ( isset($_POST['sidebar_name'] ) ) {
            $option_name = 'haru_custom_sidebars';
            $del_sidebar = trim( $_POST['sidebar_name'] );
            $custom_sidebars = haru_get_custom_sidebars();

            foreach ( $custom_sidebars as $key => $value ) {
                if ( $value == $del_sidebar ) {
                    unset( $custom_sidebars[$key] );
                    break;
                }
            }

            $custom_sidebars = array_values( $custom_sidebars );
            update_option( $option_name, $custom_sidebars );
            die( 'Deleted' );
        }
        
        die('');
    }

    add_action('wp_ajax_haru_delete_custom_sidebar', 'haru_delete_custom_sidebar');
}
/* End Add/Delete Custom Sidebar functions */

/* 
 * 2. Social Share functions 
*/

// Share Blog
if ( ! function_exists( 'haru_social_share' ) ) {
    function haru_social_share() {
        get_template_part( 'templates/social-share' );
    }

    add_action( 'haru_after_single_post_content', 'haru_social_share', 15 );
}

// Share WooCommerce
add_action( 'woocommerce_share', 'haru_social_share', 10 );


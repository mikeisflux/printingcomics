
<?php
/**
 * @package    HaruTheme
 * @version    1.0.0
 * @author     Administrator <admin@harutheme.com>
 * @copyright  Copyright 2022, HaruTheme
*/

// Declare
$haru_show_title = '';

// Pages
if ( is_page() ) {
    $haru_show_title = get_post_meta( get_the_ID(), 'haru_show_title', true );
    if ( ( $haru_show_title == '' ) || ( $haru_show_title == 'default' ) ) {
        $haru_show_title = haru_get_option( 'haru_show_page_title', '1' );
    }

    $haru_title_layout = get_post_meta( get_the_ID(), 'haru_title_layout', true );
    if ( ( $haru_title_layout == '' ) || ( $haru_title_layout == 'default' ) ) {
        $haru_title_layout = haru_get_option( 'haru_page_title_layout', 'full-width' );
    }

    $haru_title_content_layout = get_post_meta( get_the_ID(), 'haru_title_content_layout', true );
    if ( ( $haru_title_content_layout == '' ) || ( $haru_title_content_layout == 'default' ) ) {
        $haru_title_content_layout = haru_get_option( 'haru_page_title_content_layout', 'haru-container' );
    }

    $haru_title_bg_image = get_post_meta( get_the_ID(), 'haru_title_bg_image', true );
    if ( ( $haru_title_bg_image == '' ) || ( $haru_title_bg_image == 'default' ) ) {
        $haru_title_bg_image = haru_get_option( 'haru_page_title_bg_image', array() );
        if ( array_key_exists( 'url', $haru_title_bg_image ) ) {
            $haru_title_bg_image = $haru_title_bg_image['url'];
        }
    }

    $haru_title_heading = get_post_meta( get_the_ID(), 'haru_title_heading', true );
    if ( ( $haru_title_heading == '' ) || ( $haru_title_heading == 'default' ) ) {
        $haru_title_heading = haru_get_option( 'haru_page_title_heading', '1' );
    }

    $haru_title_breadcrumbs = get_post_meta( get_the_ID(), 'haru_title_breadcrumbs', true );
    if ( ( $haru_title_breadcrumbs == '' ) || ( $haru_title_breadcrumbs == 'default' ) ) {
        $haru_title_breadcrumbs = haru_get_option( 'haru_page_title_breadcrumbs', '1' );
    }

    $haru_page_title = get_post_meta( get_the_ID(), 'haru_title_custom', true );
    if ( $haru_page_title == '' ) {
        $haru_page_title = get_the_title();
    }

    $haru_page_sub_title = get_post_meta( get_the_ID(), 'haru_sub_title_custom', true );
}

// Blog (is_home is different is_front_page)
if ( is_home() ) {
    $haru_show_title = get_post_meta( get_the_ID(), 'haru_show_title', true );
    if ( ( $haru_show_title == '' ) || ( $haru_show_title == 'default' ) ) {
        $haru_show_title = haru_get_option( 'haru_show_archive_title', '1' );
    }

    $haru_title_layout = get_post_meta( get_the_ID(), 'haru_title_layout', true );
    if ( ( $haru_title_layout == '' ) || ( $haru_title_layout == 'default' ) ) {
        $haru_title_layout = haru_get_option( 'haru_archive_title_layout', 'full-width' );
    }

    $haru_title_content_layout = get_post_meta( get_the_ID(), 'haru_title_content_layout', true );
    if ( ( $haru_title_content_layout == '' ) || ( $haru_title_content_layout == 'default' ) ) {
        $haru_title_content_layout = haru_get_option( 'haru_archive_title_content_layout', 'haru-container' );
    }

    $haru_title_bg_image = get_post_meta( get_the_ID(), 'haru_title_bg_image', true );
    if ( ( $haru_title_bg_image == '' ) || ( $haru_title_bg_image == 'default' ) ) {
        $haru_title_bg_image = haru_get_option( 'haru_archive_title_bg_image', array() );
        if ( array_key_exists( 'url', $haru_title_bg_image ) ) {
            $haru_title_bg_image = $haru_title_bg_image['url'];
        }
    }

    $haru_title_heading = get_post_meta( get_the_ID(), 'haru_title_heading', true );
    if ( ( $haru_title_heading == '' ) || ( $haru_title_heading == 'default' ) ) {
        $haru_title_heading = haru_get_option( 'haru_archive_title_heading', '1' );
    }

    $haru_title_breadcrumbs = get_post_meta( get_the_ID(), 'haru_title_breadcrumbs', true );
    if ( ( $haru_title_breadcrumbs == '' ) || ( $haru_title_breadcrumbs == 'default' ) ) {
        $haru_title_breadcrumbs = haru_get_option( 'haru_archive_title_breadcrumbs', '1' );
    }

    $show_on_front = get_option( 'show_on_front' ); // core in WP
    if ( $show_on_front == 'posts' ) {
        $haru_page_title = esc_html__( 'Blog', 'pricom' );
    } elseif ( $show_on_front == 'page' && get_queried_object_id() == get_post( get_option( 'page_for_posts' ) )->ID ) {
        $haru_page_title = get_post_meta( get_post( get_option( 'page_for_posts' ) )->ID, 'haru_title_custom', true );
        if ( $haru_page_title == '' ) {
            $haru_page_title = get_post( get_option( 'page_for_posts' ) )->post_title;
        }
    }

    $haru_page_sub_title = get_post_meta( get_the_ID(), 'haru_sub_title_custom', true );
}

// Category, Archive
if ( is_category() || is_tag() || is_author() || is_day() || is_month() || is_year() || is_search() || is_tax( 'post_format' ) ) {
    $haru_show_title = haru_get_option( 'haru_show_archive_title', '1' );
    $haru_title_layout = haru_get_option( 'haru_archive_title_layout', 'full-width' );
    $haru_title_content_layout = haru_get_option( 'haru_archive_title_content_layout', 'haru-container' );
    $haru_title_bg_image = haru_get_option( 'haru_archive_title_bg_image', array() );
    if ( array_key_exists( 'url', $haru_title_bg_image ) ) {
        $haru_title_bg_image = $haru_title_bg_image['url'];
    }
    $haru_title_heading = haru_get_option( 'haru_archive_title_heading', '1' );
    $haru_title_breadcrumbs = haru_get_option( 'haru_archive_title_breadcrumbs', '1' );

    if ( is_category() ) {
        $haru_page_title = single_cat_title( '', false );
    } elseif ( is_tag() ) {
        $haru_page_title = single_tag_title( esc_html__( 'Tags: ', 'pricom' ), false );
    } elseif ( is_author() ) {
        $haru_page_title = sprintf( esc_html__( 'Author: %s', 'pricom' ), get_the_author() );
    } elseif ( is_day() ) {
        $haru_page_title = sprintf( esc_html__( 'Daily Archives: %s', 'pricom' ), get_the_date() );
    } elseif ( is_month() ) {
        $haru_page_title = sprintf( esc_html__( 'Monthly Archives: %s', 'pricom' ), get_the_date(_x('F Y', 'monthly archives date format', 'pricom' ) ) );
    } elseif ( is_year() ) {
        $haru_page_title = sprintf( esc_html__( 'Yearly Archives: %s', 'pricom' ), get_the_date(_x('Y', 'yearly archives date format', 'pricom' ) ) );
    } elseif ( is_search() ) {
        $haru_page_title = sprintf( esc_html__( 'Search Results for: %s', 'pricom' ), get_search_query() );
    } elseif ( is_tax( 'post_format', 'post-format-aside' ) ) {
        $haru_page_title = esc_html__( 'Asides', 'pricom' );
    } elseif ( is_tax( 'post_format', 'post-format-gallery' )) {
        $haru_page_title = esc_html__( 'Galleries', 'pricom' );
    } elseif ( is_tax( 'post_format', 'post-format-image')) {
        $haru_page_title = esc_html__( 'Images', 'pricom' );
    } elseif ( is_tax( 'post_format', 'post-format-video' )) {
        $haru_page_title = esc_html__( 'Videos', 'pricom' );
    } elseif ( is_tax( 'post_format', 'post-format-quote' )) {
        $haru_page_title = esc_html__( 'Quotes', 'pricom' );
    } elseif ( is_tax( 'post_format', 'post-format-link' )) {
        $haru_page_title = esc_html__( 'Links', 'pricom' );
    } elseif ( is_tax( 'post_format', 'post-format-status' )) {
        $haru_page_title = esc_html__( 'Statuses', 'pricom' );
    } elseif ( is_tax( 'post_format', 'post-format-audio' )) {
        $haru_page_title = esc_html__( 'Audios', 'pricom' );
    } elseif ( is_tax( 'post_format', 'post-format-chat' )) {
        $haru_page_title = esc_html__( 'Chats', 'pricom' );
    }
}

// Single
if ( is_singular( 'post' ) ) {
    $haru_show_title = get_post_meta( get_the_ID(), 'haru_show_title', true );
    if ( ( $haru_show_title == '' ) || ( $haru_show_title == 'default' ) ) {
        $haru_show_title = haru_get_option( 'haru_show_single_title', '1' );
    }

    $haru_title_layout = get_post_meta( get_the_ID(), 'haru_title_layout', true );
    if ( ( $haru_title_layout == '' ) || ( $haru_title_layout == 'default' ) ) {
        $haru_title_layout = haru_get_option( 'haru_single_title_layout', 'full-width' );
    }

    $haru_title_content_layout = get_post_meta( get_the_ID(), 'haru_title_content_layout', true );
    if ( ( $haru_title_content_layout == '' ) || ( $haru_title_content_layout == 'default' ) ) {
        $haru_title_content_layout = haru_get_option( 'haru_single_title_content_layout', 'haru-container' );
    }

    $haru_title_bg_image = get_post_meta( get_the_ID(), 'haru_title_bg_image', true );
    if ( ( $haru_title_bg_image == '' ) || ( $haru_title_bg_image == 'default' ) ) {
        $haru_title_bg_image = haru_get_option( 'haru_single_title_bg_image', array() );
        if ( array_key_exists( 'url', $haru_title_bg_image ) ) {
            $haru_title_bg_image = $haru_title_bg_image['url'];
        }
    }

    $haru_title_breadcrumbs = get_post_meta( get_the_ID(), 'haru_title_breadcrumbs', true );
    if ( ( $haru_title_breadcrumbs == '' ) || ( $haru_title_breadcrumbs == 'default' ) ) {
        $haru_title_breadcrumbs = haru_get_option( 'haru_single_title_breadcrumbs', '1' );
    }

    $haru_title_heading = get_post_meta( get_the_ID(), 'haru_title_heading', true );
    if ( ( $haru_title_heading == '' ) || ( $haru_title_heading == 'default' ) ) {
        $haru_title_heading = haru_get_option( 'haru_single_title_heading', '0' );
    }

    $haru_page_title = get_post_meta( get_the_ID(), 'haru_title_custom', true );
    if ( $haru_page_title == '' ) {
        $haru_page_title = get_the_title();
    }

    $haru_page_sub_title = get_post_meta( get_the_ID(), 'haru_sub_title_custom', true );
}

// Shop, Product Category, Product Tag
if ( class_exists( 'WooCommerce' ) ) {
    if ( is_shop() || is_product_category() || is_product_tag() ) {
        $haru_show_title = get_post_meta( get_the_ID(), 'haru_show_title', true );
        if ( ( $haru_show_title == '' ) || ( $haru_show_title == 'default' ) ) {
            $haru_show_title = haru_get_option( 'haru_show_archive_product_title', '1' );
        }

        $haru_title_layout = get_post_meta( get_the_ID(), 'haru_title_layout', true );
        if ( ( $haru_title_layout == '' ) || ( $haru_title_layout == 'default' ) ) {
            $haru_title_layout = haru_get_option( 'haru_archive_product_title_layout', 'full-width' );
        }

        $haru_title_content_layout = get_post_meta( get_the_ID(), 'haru_title_content_layout', true );
        if ( ( $haru_title_content_layout == '' ) || ( $haru_title_content_layout == 'default' ) ) {
            $haru_title_content_layout = haru_get_option( 'haru_archive_product_title_content_layout', 'haru-container' );
        }

        $haru_title_bg_image = get_post_meta( get_the_ID(), 'haru_title_bg_image', true );
        if ( ( $haru_title_bg_image == '' ) || ( $haru_title_bg_image == 'default' ) ) {
            $haru_title_bg_image = haru_get_option( 'haru_archive_product_title_bg_image', array() );
            if ( array_key_exists( 'url', $haru_title_bg_image ) ) {
                $haru_title_bg_image = $haru_title_bg_image['url'];
            }
        }

        $haru_title_heading = get_post_meta( get_the_ID(), 'haru_title_heading', true );
        if ( ( $haru_title_heading == '' ) || ( $haru_title_heading == 'default' ) ) {
            $haru_title_heading = haru_get_option( 'haru_archive_product_title_heading', '1' );
        }

        $haru_title_breadcrumbs = get_post_meta( get_the_ID(), 'haru_title_breadcrumbs', true );
        if ( ( $haru_title_breadcrumbs == '' ) || ( $haru_title_breadcrumbs == 'default' ) ) {
            $haru_title_breadcrumbs = haru_get_option( 'haru_archive_product_title_breadcrumbs', '1' );
        }

        if ( apply_filters( 'woocommerce_show_page_title', true ) ) {
            $haru_page_title = woocommerce_page_title( false );
        }

        if ( is_shop() ) {
            $shop_page_id = get_option( 'woocommerce_shop_page_id' );
            $haru_page_sub_title = get_post_meta( $shop_page_id, 'haru_sub_title_custom', true );
        }

        if ( is_product_category() || is_product_tag() ) {
            $haru_title_bg_image = get_term_meta( get_queried_object_id(), 'haru_title_bg_image', true );

            if ( $haru_title_bg_image == '' ) {
                $haru_title_bg_image = haru_get_option( 'haru_archive_product_title_bg_image', array() );
                if ( array_key_exists( 'url', $haru_title_bg_image ) ) {
                    $haru_title_bg_image = $haru_title_bg_image['url'];
                }
            }
        }
    }
}

if ( is_singular( 'product' ) ) {
    $haru_show_title = get_post_meta( get_the_ID(), 'haru_show_title', true );
    if ( ( $haru_show_title == '' ) || ( $haru_show_title == 'default' ) ) {
        $haru_show_title = haru_get_option( 'haru_show_single_product_title', '1' );
    }

    $haru_title_layout = get_post_meta( get_the_ID(), 'haru_title_layout', true );
    if ( ( $haru_title_layout == '' ) || ( $haru_title_layout == 'default' ) ) {
        $haru_title_layout = haru_get_option( 'haru_single_product_title_layout', 'full-width' );
    }

    $haru_title_content_layout = get_post_meta( get_the_ID(), 'haru_title_content_layout', true );
    if ( ( $haru_title_content_layout == '' ) || ( $haru_title_content_layout == 'default' ) ) {
        $haru_title_content_layout = haru_get_option( 'haru_single_product_title_content_layout', 'haru-container' );
    }

    $haru_title_bg_image = get_post_meta( get_the_ID(), 'haru_title_bg_image', true );
    if ( ( $haru_title_bg_image == '' ) || ( $haru_title_bg_image == 'default' ) ) {
        $haru_title_bg_image = haru_get_option( 'haru_single_product_title_bg_image', array() );
        if ( array_key_exists( 'url', $haru_title_bg_image ) ) {
            $haru_title_bg_image = $haru_title_bg_image['url'];
        }
    }

    $haru_title_heading = get_post_meta( get_the_ID(), 'haru_title_heading', true );
    if ( ( $haru_title_heading == '' ) || ( $haru_title_heading == 'default' ) ) {
        $haru_title_heading = haru_get_option( 'haru_single_product_title_heading', '0' );
    }

    $haru_title_breadcrumbs = get_post_meta( get_the_ID(), 'haru_title_breadcrumbs', true );
    if ( ( $haru_title_breadcrumbs == '' ) || ( $haru_title_breadcrumbs == 'default' ) ) {
        $haru_title_breadcrumbs = haru_get_option( 'haru_single_product_title_breadcrumbs', '1' );
    }

    $haru_page_title = get_post_meta( get_the_ID(), 'haru_title_custom', true );
    if ( $haru_page_title == '' ) {
        $haru_page_title = get_the_title();
    }

    $haru_page_sub_title = get_post_meta( get_the_ID(), 'haru_sub_title_custom', true );
}

if ( is_404() ) {
    $haru_page_title = esc_html__( 'Nothing Found', 'pricom' );
}

?>

<?php if ( $haru_show_title == '1' ) : ?>
    <div class="haru-page-title <?php echo esc_attr( $haru_title_bg_image ? 'has-bg-image' : '' ); ?> <?php echo esc_attr( $haru_title_layout ); ?> <?php echo esc_attr( ( $haru_title_heading == '1' ) ? 'has-heading' : '' ); ?>" 
        <?php if ( $haru_title_bg_image ) : ?>style="background-image: url('<?php echo esc_url( $haru_title_bg_image ); ?>')"<?php endif; ?>
    >
        <div class="haru-page-title__content <?php echo esc_attr( $haru_title_content_layout ); ?>">
            <?php if ( $haru_title_heading == '1' ) : ?>
            <div class="haru-page-title__heading">
                <?php if ( isset( $haru_page_title ) && ( $haru_page_title != '' ) ) : ?>
                    <h2 class="haru-page-title__heading--main"><?php echo esc_html( $haru_page_title ); ?></h2>
                <?php endif; ?>
                <?php if ( isset( $haru_page_sub_title) && ( $haru_page_sub_title != '' ) ) : ?>
                    <div class="haru-page-title__heading--sub"><?php echo esc_html( $haru_page_sub_title ); ?></div>
                <?php endif; ?>
            </div>
            <?php endif; ?>
            <?php if ( $haru_title_breadcrumbs == '1' ) : ?>
                <div class="haru-page-title__breadcrumbs">
                    <?php get_template_part( 'templates/breadcrumb' ); ?>
                </div>
            <?php endif; ?>
        </div>
    </div>
<?php endif; ?>

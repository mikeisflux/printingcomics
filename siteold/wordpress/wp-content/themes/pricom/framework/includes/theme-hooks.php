<?php
/**
 * @package    HaruTheme
 * @version    1.0.0
 * @author     Administrator <admin@harutheme.com>
 * @copyright  Copyright 2022, HaruTheme
*/

/* 
 * TABLE OF FUNCTIONS
 * 1. haru_before_page_main
 * 2. haru_before_page_main_content
 * 3. haru_after_page_main
 * 3. haru_archive_heading
 * 4. haru_after_single_post_content
 * 5. haru_after_single_post
 * 6. haru_before_page
 * 7. haru_footer_main
*/

/* 
 * 0. Check Cookie
*/
if ( !function_exists( 'haru_check_dark_mode' ) ) {
  function haru_check_dark_mode() {
    global $dark_mode;

    if ( isset( $_COOKIE['dark-mode'] ) ) {
      $dark_mode = trim( $_COOKIE['dark-mode'] );
    } else {
      $dark_mode = '';
    }
  }

  add_action( 'init', 'haru_check_dark_mode', 1 );
}

// 1. haru_before_page_main
if ( ! function_exists( 'haru_loading_animation' ) ) {
  function haru_loading_animation() {
    get_template_part( 'templates/loading-animation' );
  }
}
add_action( 'haru_before_page_main', 'haru_loading_animation', 5 );

if ( ! function_exists( 'haru_newsletter_popup' ) ) {
  function haru_newsletter_popup() {
    get_template_part( 'templates/newsletter-popup' );
  }
}
add_action( 'haru_before_page_main', 'haru_newsletter_popup', 10 );

if ( ! function_exists( 'haru_onepage_navigation' ) ) {
  function haru_onepage_navigation() {
    get_template_part( 'templates/onepage-navigation' );
  }
}
add_action( 'haru_before_page_main', 'haru_onepage_navigation', 15 );

// 2. haru_before_page_main_content
// 2.1. Haru Header
if ( ! function_exists( 'haru_page_header' ) ) {
  function haru_page_header() {
    get_template_part( 'templates/header', 'template' );
  }
  add_action( 'haru_before_page_main_content', 'haru_page_header', 5 );
}

// 3. haru_after_page_main
// 3.1. Back to Top
if ( ! function_exists( 'haru_back_to_top' ) ) {
  function haru_back_to_top() {
    get_template_part( 'templates/back-to-top' );
  }
}

$back_to_top = haru_get_option( 'haru_back_to_top', '1' );
if ( $back_to_top == '1' ) {
  add_action( 'haru_after_page_main', 'haru_back_to_top', 5 );
}

if ( ! function_exists( 'haru_switch_theme_mode' ) ) {
  function haru_switch_theme_mode() {
    get_template_part( 'templates/switch-theme-mode' );
  }
}

add_action( 'haru_after_page_main', 'haru_switch_theme_mode', 10 );

// 3.2. Login Popup
if ( ! function_exists( 'haru_login_popup' ) ) {
  function haru_login_popup() {
    // Check is maintenance pagmain      
    if ( ! shortcode_exists( 'woocommerce_my_account' ) ) {
      return;
    }
    if ( is_user_logged_in() ) {
      return;
    }
    ?>
    <div id="login-popup" class="login-modal unero-modal woocommerce-account" tabindex="-1" role="dialog">
      <div class="modal-content">
        <div class="container">
          <?php echo do_shortcode( '[woocommerce_my_account]' ) ?>
        </div>
      </div>
      <div class="modal-footer">
        <a href="#" class="close-modal"><?php echo esc_html__( 'Close', 'pricom' ) ?></a>
      </div>
    </div>
    <?php
  }
}

// 3.3. Ajax loading overflow (also can change loading effect similar page loading)
function haru_ajax_loading() {
  ?>
  <!-- May be check condition -->
  <div class="haru-ajax-overflow">
    <div class="haru-ajax-loading">
      <div class="loading-wrapper">
        <div class="spinner" id="spinner_one"></div>
        <div class="spinner" id="spinner_two"></div>
        <div class="spinner" id="spinner_three"></div>
        <div class="spinner" id="spinner_four"></div>
        <div class="spinner" id="spinner_five"></div>
        <div class="spinner" id="spinner_six"></div>
        <div class="spinner" id="spinner_seven"></div>
        <div class="spinner" id="spinner_eight"></div>
      </div>
    </div>
  </div>
  <?php
}
add_action( 'haru_after_page_main', 'haru_ajax_loading', 10 );

/* 3. haru_archive_heading */
if ( ! function_exists( 'haru_archive_heading' ) ) {
  function haru_archive_heading() {
    get_template_part( 'templates/page-heading' );
  }

  add_action( 'haru_before_archive', 'haru_archive_heading', 5 );
}

/* 4. haru_after_single_post_content */
/* 4.1. Link pages */
if ( ! function_exists( 'haru_link_pages' ) ) {
  function haru_link_pages() {
    wp_link_pages( array(
      'before'      => '<div class="haru-page-links"><span class="haru-page-links-title">' . esc_html__( 'Pages:', 'pricom' ) . '</span>',
      'after'       => '</div>',
      'link_before' => '<span class="haru-page-link">',
      'link_after'  => '</span>',
    ) );
  }

  add_action('haru_after_single_post_content', 'haru_link_pages', 5);
}
/* 4.2. Post tags */
if ( ! function_exists( 'haru_post_tags' ) ) {
  function haru_post_tags() {
    get_template_part('templates/single/post-tags');
  }

  add_action( 'haru_after_single_post_content', 'haru_post_tags', 10 );
}

/* 5. haru_after_single_post */
/* 5.1. Post navigation */
if ( ! function_exists( 'haru_post_nav' ) ) {
  function haru_post_nav() {
    get_template_part( 'templates/single/post-nav' );
  }

  $single_navigation = haru_get_option( 'haru_single_navigation', '0' );
  if ( $single_navigation == '1' ) {
    add_action( 'haru_after_single_post', 'haru_post_nav', 5 );
  }
}

/* 5.2. Post Author */
if ( ! function_exists( 'haru_post_author' ) ) {
  function haru_post_author() {
    get_template_part( 'templates/single/post-author' );
  }

  
  $single_author_info = haru_get_option( 'haru_single_author_info', '0' );
  if ( $single_author_info == '1' ) {
    add_action( 'haru_after_single_post', 'haru_post_author', 10 );
  }
}

/* 5.3. Post Related */
if ( ! function_exists( 'haru_post_related' ) ) {
  function haru_post_related() {
    get_template_part( 'templates/single/post-related' );
  }

  $single_related = haru_get_option( 'haru_single_related', '0' );
  if ( $single_related == '1' ) {
    add_action( 'haru_after_single_post', 'haru_post_related', 15 );
  }
}

/* 6. haru_before_page */
/* 6.1. Page Heading */
if ( ! function_exists( 'haru_page_heading' ) ) {
  function haru_page_heading() {
    get_template_part( 'templates/page-heading' );
  }

  add_action( 'haru_before_page', 'haru_page_heading', 5 );
}

/* 7. haru_footer_main */
if ( ! function_exists( 'haru_footer_block' ) ) {
  function haru_footer_block() {
    get_template_part( 'templates/footer', 'template' );
  }

  add_action( 'haru_footer_main',  'haru_footer_block', 5 );
}


/* 9. Render Comments */
if ( ! function_exists( 'haru_render_comments' ) ) {
  function haru_render_comments( $comment, $args, $depth ) {
    $GLOBALS['comment'] = $comment;
  ?>
    <li <?php comment_class(); ?> id="li-comment-<?php comment_ID() ?>">
      <div id="comment-<?php comment_ID(); ?>" class="comment-body">
        <div class="author-avatar">
          <?php echo get_avatar( $comment, $args['avatar_size'] ); ?>
        </div>
        <div class="comment-text">
          <div class="author">
            <div class="author-name"><?php printf( esc_html__( '%s', 'pricom' ), get_comment_author_link() ) ?></div>
          </div>
          <div class="text">
            <?php comment_text(); ?>
            <?php if ( $comment->comment_approved == '0' ) : ?>
              <em><?php echo esc_html__( 'Your comment is awaiting moderation.', 'pricom' ) ?></em>
            <?php endif; ?>
          </div>
          <div class="comment-meta">
            <div class="comment-meta-date">
              <span class="time">
                <?php echo get_comment_date(); ?>
              </span>
            </div>
            <div class="comment-meta-action">
              <?php comment_reply_link( array_merge( $args, array( 'depth' => $depth, 'max_depth' => $args['max_depth'] ) ) ); ?>
              <?php edit_comment_link( esc_html__( 'Edit', 'pricom' ), '', '' ); ?>
            </div>
          </div>
        </div>
      </div>
  <?php
  }
}

/* 13. Comments Form */
if ( ! function_exists('haru_comment_form') ) {
  function haru_comment_form( $args = array(), $post_id = null ) {
    global $id;

    $user = wp_get_current_user();
    $user_identity = $user->exists() ? $user->display_name : '';

    if ( null === $post_id ) {
      $post_id = $id;
    } else {
      $id = $post_id;
    }

    if ( comments_open( $post_id ) ) :
  ?>
    <div id="respond-wrapper">
      <?php
        $commenter = wp_get_current_commenter();
        $req       = get_option( 'require_name_email' );
        $aria_req  = ( $req ? " aria-required='true'" : '' );

        $fields    =  array(
          'author'        => '<div class="haru-row haru-field-group"><div class="comment-form-author haru-field haru-col-sm-6 haru-col-xs-12"><input id="author" name="author" type="text" placeholder="' . esc_attr__( 'Enter Your Name*', 'pricom' ) . '" class="form-control" value="' . esc_attr( $commenter['comment_author'] ) . '" size="30"' . $aria_req . ' /></div>',
          'email'         => '<div class="comment-form-email haru-field haru-col-sm-6 haru-col-xs-12"><input id="email" name="email" type="text" placeholder="' . esc_attr__( 'Enter Your Email*', 'pricom' ) . '" class="form-control" value="' . esc_attr(  $commenter['comment_author_email'] ) . '" size="30"' . $aria_req . ' /></div></div>',
          'comment_field' => '<div class="haru-row haru-field-group"><div class="haru-col-sm-12"><div class="comment-form-comment haru-field"><textarea class="form-control" placeholder="' . esc_attr__( 'Enter Your Comment', 'pricom' ) . '" id="comment" name="comment" cols="40" rows="6" aria-required="true"></textarea></div></div></div>'
        );

        $comments_args = array(
            'fields'               => apply_filters( 'comment_form_default_fields', $fields ),
            'logged_in_as'         => '<p class="logged-in-as">' .
            sprintf(
            __( 'Logged in as <a href="%1$s">%2$s</a>. <a href="%3$s">Log out?</a>', 'pricom' ),
              admin_url( 'profile.php' ),
              $user_identity,
              wp_logout_url( apply_filters( 'the_permalink', get_permalink( ) ) )
            ) . '</p>',
            'title_reply'          => esc_html__( 'Leave us a comment', 'pricom' ),
            'title_reply_to'       => esc_html__( 'Leave a reply to %s', 'pricom' ),
            'title_reply_before'   => '<h3 id="reply-title" class="comment-reply-title haru-heading haru-heading--style-1">',
            'cancel_reply_link'    => esc_html__( 'Cancel Reply', 'pricom' ),
            'comment_notes_before' => '',
            'comment_notes_after'  => '',
            'submit_button'        => '<input name="%1$s" type="submit" id="%2$s" class="%3$s haru-button haru-button--size-medium haru-button--bg-black haru-button--round-normal" value="%4$s" />',
            'label_submit'         => esc_html__( 'Post Comment', 'pricom' ),
            'comment_field'        => '',
            'must_log_in'          => ''
        );

        if ( is_user_logged_in() ) {
          $comments_args['comment_field'] = '<p class="comment-form-comment"><textarea class="form-control" placeholder="' . esc_attr__( 'Enter Your Comment', 'pricom' ) . '" id="comment" name="comment" cols="40" rows="6" aria-required="true"></textarea></p>';
        }
      ?>
      <?php if ( get_option( 'comment_registration' ) && ! is_user_logged_in() ) : ?>
        <?php echo sprintf(
            __( '<div class="comment-require-login">You must be <a href="%1$s">logged in</a> to post a comment!</div>', 'pricom' ),
              esc_url( wp_login_url( get_permalink() ) )
            ); ?>
      <?php else : ?>
        <?php comment_form( $comments_args ); ?>
      <?php endif; ?>
    </div>

    <?php
    endif;
  }
}


/* 14. Comments Time by ago */
if ( ! function_exists( 'haru_relative_time' ) ) {
  function haru_relative_time( $a = '' ) {
    return human_time_diff( $a, current_time( 'timestamp' ) );
  }
}

/* 15. Bottom Toolbar */
if ( ! function_exists( 'haru_bottom_toolbar' ) ) {
  function haru_bottom_toolbar() {
    get_template_part( 'templates/bottom', 'toolbar' );
  }

  add_action( 'haru_after_page_main', 'haru_bottom_toolbar', 15 );
}
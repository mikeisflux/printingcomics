<?php
/**
 * @package    HaruTheme
 * @version    1.0.0
 * @author     Administrator <admin@harutheme.com>
 * @copyright  Copyright 2022, HaruTheme
*/

if ( post_password_required() ) {
  return;
}
?>
<?php if ( comments_open() || get_comments_number() ) : ?>
  <div id="comments" class="post-comments">
    <?php if ( have_comments() ) : ?>
      <h6 class="comments-title haru-heading haru-heading--style-1">
        <?php comments_number( esc_html__( 'No Comments', 'pricom' ), esc_html__( 'One Comment', 'pricom' ), esc_html__( 'There are % comments', 'pricom' ) ); ?>
      </h6>
      <div class="post-comments-list">
        <?php if ( get_comment_pages_count() > 1 && get_option( 'page_comments' ) ) : ?>
          <nav class="comment-navigation">
            <?php
              $paginate_comments_args = array(
                'prev_text' => '<i class="fa fa-angle-double-left"></i>',
                'next_text' => '<i class="fa fa-angle-double-right"></i>'
              );
              paginate_comments_links( $paginate_comments_args );
            ?>
          </nav>
        <?php endif; ?>

        <ol class="comment-list">
          <?php
            wp_list_comments( array(
              'style'       => 'li',
              'callback'    => 'haru_render_comments',
              'avatar_size' => 70,
              'short_ping'  => true,
            ) );
          ?>
        </ol>

        <?php if ( get_comment_pages_count() > 1 && get_option( 'page_comments' ) ) : ?>
          <nav class="comment-navigation comment-navigation-bottom" role="navigation">
            <?php paginate_comments_links( $paginate_comments_args ); ?>
          </nav>
        <?php endif; ?>
      </div>
    <?php endif;?>

    <?php if ( comments_open() ) : ?>
      <div class="post-comments-form">
        <?php haru_comment_form(); ?>
      </div>
    <?php endif; ?>
  </div>
<?php endif; ?>
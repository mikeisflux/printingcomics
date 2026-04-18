<?php
/**
 * @package    HaruTheme
 * @version    1.0.0
 * @author     Administrator <admin@harutheme.com>
 * @copyright  Copyright 2022, HaruTheme
*/
?>
<div class="post-meta-date"><?php echo date_i18n( get_option( 'date_format' ), strtotime(get_the_date('Y-m-d')) ); ?></div>
<div class="post-meta-author"><span class="post-by"><?php echo esc_html__( 'by', 'pricom' ) ?></span>
  <?php printf('<a href="%1$s">%2$s</a>', esc_url( get_author_posts_url( get_the_author_meta( 'ID' ) ) ), esc_html( get_the_author() ) ); ?>
</div>
<div class="post-meta-comment">
  <?php 
    $num_comments = get_comments_number();
    if ( $num_comments == 0 ) {
      $comments = esc_html__( 'No Comments', 'pricom' );
    } elseif ( $num_comments > 1 ) {
      $comments = $num_comments . esc_html__( ' Comments', 'pricom' );
    } else {
      $comments = esc_html__( '1 Comment', 'pricom' );
    }

    printf('<a href="%1$s">%2$s</a>', esc_url( get_comments_link() ), $comments ); 
  ?>
</div>
<?php if ( is_sticky() ) : ?>
<div class="post-meta-sticky"><?php echo esc_html__( 'Sticky', 'pricom' ); ?></div>
<?php endif; ?>

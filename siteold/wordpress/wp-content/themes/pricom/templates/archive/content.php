<?php
/**
 * @package    HaruTheme
 * @version    1.0.0
 * @author     Administrator <admin@harutheme.com>
 * @copyright  Copyright 2022, HaruTheme
*/

global $post;

// Process archive post class
$archive_display_type = haru_get_option( 'haru_archive_display_type', 'large-image' );

// Use for Demo
if ( isset( $_GET['blog_style'] ) ) {
    $archive_display_type = wc_clean( $_GET['blog_style'] ); // large-image, medium-image, grid
}

$post_classes[] = 'grid-item';
$post_classes[] = $archive_display_type;

if ( in_array( $archive_display_type, array( 'grid' ) ) ) {

} else {
  
}

$post_excerpt = haru_get_option( 'haru_archive_number_exceprt', 30 );

// Use for Demo
if ( isset( $_GET['number_excerpt'] ) ) {
  $post_excerpt = wc_clean( $_GET['number_excerpt'] );
}

?>
<article id="post-<?php the_ID(); ?>" <?php post_class( $post_classes ); ?> >
  <div class="post-wrap">
    <?php 
      $post_thumb = haru_post_thumbnail(); 
      if ( $post_thumb ) :
    ?>
    <div class="post-thumbnail-wrap">
      <?php echo haru_post_thumbnail(); ?>
    </div>
    <?php endif; ?>
    <div class="post-content-wrap">
      <div class="post-detail">
        <div class="post-detail-content">
          <?php if ( has_category() ) : ?>
            <div class="post-category-wrap"><?php echo get_the_category_list(' '); ?></div>
          <?php endif; ?>
          <h3 class="post-title">
            <a href="<?php the_permalink(); ?>" rel="bookmark" title="<?php the_title_attribute(); ?>"><?php the_title(); ?></a>
          </h3>
          <?php if ( 'product' != $post->post_type ) : ?>
          <div class="post-meta-info">
            <?php get_template_part( 'templates/archive/post-meta' ); ?>
          </div>
          <?php endif; ?>
          <div class="post-excerpt">
            <?php 
              if ( has_excerpt() ) {
                echo wp_trim_words( get_the_excerpt(), $post_excerpt, '...' );
              } else {
                echo wp_trim_words( get_the_content(), $post_excerpt, '...' ); 
              }
            ?>
          </div>
          <div class="post-read-more">
            <?php if ( 'product' != $post->post_type ) : ?>
              <a href="<?php the_permalink(); ?>" class="read-more haru-button haru-button--size-medium haru-button--bg-primary haru-button--round-normal" rel="bookmark" title="<?php the_title_attribute(); ?>"><?php echo esc_html__( 'Read more', 'pricom' ); ?></a>
            <?php else : ?>
              <a href="<?php the_permalink(); ?>" class="read-more haru-button haru-button--size-medium haru-button--bg-primary haru-button--round-normal" rel="bookmark" title="<?php the_title_attribute(); ?>"><?php echo esc_html__( 'View product', 'pricom' ); ?></a>
            <?php endif; ?>
          </div>
        </div>
      </div>
    </div>
  </div>
</article>
